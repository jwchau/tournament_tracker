import threading

from sqlmodel import Session, SQLModel, create_engine

from app.db import configure_sqlite_engine
from app.models import Match, Team, Tournament
from app.scoring import VersionConflict, correct_score, submit_score


def _make_engine(tmp_path):
    db_path = tmp_path / "concurrency.db"
    engine = configure_sqlite_engine(
        create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    )
    SQLModel.metadata.create_all(engine)
    return engine


def _seed_ready_match(engine) -> int:
    with Session(engine) as session:
        tournament = Tournament(name="Concurrency Cup")
        session.add(tournament)
        session.commit()
        session.refresh(tournament)

        team1 = Team(tournament_id=tournament.id, name="Alpha", seed=1)
        team2 = Team(tournament_id=tournament.id, name="Beta", seed=2)
        session.add(team1)
        session.add(team2)
        session.commit()
        session.refresh(team1)
        session.refresh(team2)

        match = Match(
            tournament_id=tournament.id,
            round=1,
            position=1,
            team1_id=team1.id,
            team2_id=team2.id,
            status="ready",
            version=1,
        )
        session.add(match)
        session.commit()
        session.refresh(match)
        return match.id


def _seed_two_semifinals_feeding_one_final(engine):
    with Session(engine) as session:
        tournament = Tournament(name="Concurrency Cup")
        session.add(tournament)
        session.commit()
        session.refresh(tournament)

        teams = [
            Team(tournament_id=tournament.id, name=name, seed=seed)
            for seed, name in enumerate(["Alpha", "Beta", "Gamma", "Delta"], start=1)
        ]
        for team in teams:
            session.add(team)
        session.commit()
        for team in teams:
            session.refresh(team)

        final = Match(
            tournament_id=tournament.id,
            round=2,
            position=1,
            status="pending",
            version=1,
        )
        session.add(final)
        session.commit()
        session.refresh(final)

        semifinal1 = Match(
            tournament_id=tournament.id,
            round=1,
            position=1,
            team1_id=teams[0].id,
            team2_id=teams[1].id,
            status="ready",
            version=1,
            winner_next_match_id=final.id,
            winner_next_slot=1,
        )
        semifinal2 = Match(
            tournament_id=tournament.id,
            round=1,
            position=2,
            team1_id=teams[2].id,
            team2_id=teams[3].id,
            status="ready",
            version=1,
            winner_next_match_id=final.id,
            winner_next_slot=2,
        )
        session.add(semifinal1)
        session.add(semifinal2)
        session.commit()
        session.refresh(semifinal1)
        session.refresh(semifinal2)

        return final.id, semifinal1.id, semifinal2.id, teams[0].id, teams[2].id


def test_two_matches_completing_concurrently_populate_different_slots_of_same_next_match(
    tmp_path,
):
    engine = _make_engine(tmp_path)
    final_id, semifinal1_id, semifinal2_id, winner1_id, winner2_id = (
        _seed_two_semifinals_feeding_one_final(engine)
    )

    def complete(match_id, winner_score, loser_score):
        with Session(engine) as session:
            submit_score(
                session,
                match_id,
                team1_score=winner_score,
                team2_score=loser_score,
                expected_version=1,
                complete=True,
            )

    threads = [
        threading.Thread(target=complete, args=(semifinal1_id, 21, 10)),
        threading.Thread(target=complete, args=(semifinal2_id, 21, 15)),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    with Session(engine) as session:
        final = session.get(Match, final_id)
        assert final.team1_id == winner1_id
        assert final.team2_id == winner2_id
        assert final.status == "ready"


def test_concurrent_score_submissions_exactly_one_succeeds(tmp_path):
    engine = _make_engine(tmp_path)
    match_id = _seed_ready_match(engine)

    outcomes = []
    lock = threading.Lock()

    def attempt():
        with Session(engine) as session:
            try:
                submit_score(
                    session,
                    match_id,
                    team1_score=21,
                    team2_score=15,
                    expected_version=1,
                    complete=True,
                )
                outcome = "ok"
            except VersionConflict:
                outcome = "conflict"
        with lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=attempt) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert outcomes.count("ok") == 1
    assert outcomes.count("conflict") == 9

    with Session(engine) as session:
        final = session.get(Match, match_id)
        assert final.version == 2
        assert final.status == "complete"
        assert final.winner_id == final.team1_id


def test_correction_racing_a_downstream_score_submission_never_loses_a_write(tmp_path):
    for attempt in range(20):
        attempt_dir = tmp_path / str(attempt)
        attempt_dir.mkdir()
        engine = _make_engine(attempt_dir)
        final_id, semifinal1_id, semifinal2_id, _, _ = _seed_two_semifinals_feeding_one_final(
            engine
        )
        with Session(engine) as session:
            submit_score(session, semifinal1_id, 21, 10, expected_version=1, complete=True)
            submit_score(session, semifinal2_id, 21, 10, expected_version=1, complete=True)
            final_version = session.get(Match, final_id).version
            semifinal1 = session.get(Match, semifinal1_id)
            semifinal1_version, corrected_winner = semifinal1.version, semifinal1.team2_id

        outcomes = {}
        barrier = threading.Barrier(2)

        def submit_final():
            with Session(engine) as session:
                barrier.wait()
                try:
                    submit_score(
                        session, final_id, 21, 10, expected_version=final_version, complete=True
                    )
                    outcomes["submission"] = "ok"
                except VersionConflict:
                    outcomes["submission"] = "conflict"

        def correct_semifinal():
            with Session(engine) as session:
                barrier.wait()
                outcomes["correction"] = correct_score(
                    session, semifinal1_id, 10, 21, expected_version=semifinal1_version
                )

        threads = [threading.Thread(target=submit_final), threading.Thread(target=correct_semifinal)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert outcomes["submission"] in ("ok", "conflict")
        assert outcomes["correction"].log.reset_match_ids == [final_id]
        with Session(engine) as session:
            final = session.get(Match, final_id)
            assert final.team1_id == corrected_winner
            assert final.team1_score is None
            assert final.team2_score is None
            assert final.winner_id is None
            assert final.status == "ready"
        engine.dispose()
