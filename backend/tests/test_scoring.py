import pytest

from app.models import Match, Team, Tournament
from app.scoring import InvalidScore, submit_score


@pytest.fixture(name="tournament_id")
def tournament_id_fixture(session):
    tournament = Tournament(name="Winter Cup")
    session.add(tournament)
    session.commit()
    session.refresh(tournament)
    return tournament.id


def _make_team(session, tournament_id, name, seed):
    team = Team(tournament_id=tournament_id, name=name, seed=seed)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


def test_completing_a_match_advances_winner_into_next_match_slot(session, tournament_id):
    team1 = _make_team(session, tournament_id, "Alpha", 1)
    team2 = _make_team(session, tournament_id, "Beta", 2)

    final = Match(
        tournament_id=tournament_id,
        round=2,
        position=1,
        status="pending",
        version=1,
    )
    session.add(final)
    session.commit()
    session.refresh(final)

    semifinal = Match(
        tournament_id=tournament_id,
        round=1,
        position=1,
        team1_id=team1.id,
        team2_id=team2.id,
        status="ready",
        version=1,
        winner_next_match_id=final.id,
        winner_next_slot=1,
    )
    session.add(semifinal)
    session.commit()
    session.refresh(semifinal)

    updated = submit_score(
        session,
        semifinal.id,
        team1_score=21,
        team2_score=10,
        expected_version=1,
        complete=True,
    )

    assert updated.status == "complete"
    assert updated.winner_id == team1.id

    session.refresh(final)
    assert final.team1_id == team1.id
    assert final.team2_id is None
    assert final.status == "pending"


def test_completing_a_match_with_a_tied_score_is_rejected(session, tournament_id):
    team1 = _make_team(session, tournament_id, "Alpha", 1)
    team2 = _make_team(session, tournament_id, "Beta", 2)

    match = Match(
        tournament_id=tournament_id,
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

    with pytest.raises(InvalidScore):
        submit_score(
            session,
            match.id,
            team1_score=15,
            team2_score=15,
            expected_version=1,
            complete=True,
        )

    session.refresh(match)
    assert match.status == "ready"
    assert match.version == 1


def test_completing_a_match_before_both_teams_known_is_rejected(session, tournament_id):
    team1 = _make_team(session, tournament_id, "Alpha", 1)

    match = Match(
        tournament_id=tournament_id,
        round=2,
        position=1,
        team1_id=team1.id,
        team2_id=None,
        status="pending",
        version=1,
    )
    session.add(match)
    session.commit()
    session.refresh(match)

    with pytest.raises(InvalidScore):
        submit_score(
            session,
            match.id,
            team1_score=21,
            team2_score=10,
            expected_version=1,
            complete=True,
        )

    session.refresh(match)
    assert match.status == "pending"
    assert match.version == 1


def test_resubmitting_a_score_to_an_already_complete_match_is_rejected(session, tournament_id):
    team1 = _make_team(session, tournament_id, "Alpha", 1)
    team2 = _make_team(session, tournament_id, "Beta", 2)

    match = Match(
        tournament_id=tournament_id,
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

    submit_score(
        session,
        match.id,
        team1_score=21,
        team2_score=10,
        expected_version=1,
        complete=True,
    )

    with pytest.raises(InvalidScore):
        submit_score(
            session,
            match.id,
            team1_score=5,
            team2_score=21,
            expected_version=2,
            complete=True,
        )

    session.refresh(match)
    assert match.status == "complete"
    assert match.winner_id == team1.id
    assert match.version == 2
