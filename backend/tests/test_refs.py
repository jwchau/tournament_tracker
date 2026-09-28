from collections import Counter

from sqlalchemy import create_engine
from sqlmodel import Session, select

from app.db import init_db
from app.models import Match, Pool, Team, Tournament
from app.pools import generate_round_robin
from app.refs import RefSlotMatch, assign_refs, backfill_pool_refs


def _slots(team_ids, courts, n=1):
    """A generated round-robin as ref-assignment input, with made-up match ids."""
    ids = iter(range(1, 1000))
    return [
        [RefSlotMatch(next(ids), m.team1_id, m.team2_id) for m in slot]
        for slot in generate_round_robin(team_ids, courts, n)
    ]


def test_with_one_court_every_match_gets_an_idle_team_and_reffing_is_spread_evenly():
    teams = [1, 2, 3, 4, 5]
    slots = _slots(teams, [1])

    refs = assign_refs(teams, slots)

    for slot in slots:
        [match] = slot
        assert refs[match.match_id] not in (None, match.team1_id, match.team2_id)
    counts = Counter(refs.values())
    assert max(counts.values()) - min(counts[t] for t in teams) <= 1


def test_five_teams_on_two_courts_the_idle_team_refs_one_match_and_the_other_is_na():
    teams = [1, 2, 3, 4, 5]
    slots = _slots(teams, [1, 2])

    refs = assign_refs(teams, slots)

    for slot in slots:
        playing = {t for m in slot for t in (m.team1_id, m.team2_id)}
        [idle] = set(teams) - playing
        assert [refs[m.match_id] for m in slot] == [idle, None]
    # Each team sits out once, so each refs once.
    assert Counter(r for r in refs.values() if r is not None) == Counter(teams)


def test_four_teams_on_two_courts_have_no_ref_to_spare():
    teams = [1, 2, 3, 4]

    refs = assign_refs(teams, _slots(teams, [1, 2]))

    assert set(refs.values()) == {None}


def test_a_team_never_refs_two_matches_in_one_slot():
    teams = [1, 2, 3, 4, 5, 6]
    slots = _slots(teams, [1, 2])

    refs = assign_refs(teams, slots)

    for slot in slots:
        slot_refs = [refs[m.match_id] for m in slot]
        assert None not in slot_refs and len(set(slot_refs)) == len(slot_refs)


def test_a_tie_on_count_goes_past_the_previous_slots_ref_before_seed():
    teams = [1, 2, 3, 4]
    slots = [
        [RefSlotMatch(1, 3, 4, hand_set=True, ref_team_id=2)],
        [RefSlotMatch(2, 3, 4, hand_set=True, ref_team_id=1)],
        # 1 and 2 have reffed once each; 1 is the better seed but reffed last slot.
        [RefSlotMatch(3, 3, 4)],
    ]

    assert assign_refs(teams, slots) == {3: 2}


def test_the_fewest_refs_so_far_wins_over_seed():
    teams = [1, 2, 3, 4, 5]
    slots = [
        [RefSlotMatch(1, 4, 5)],  # 1 (best seed)
        [RefSlotMatch(2, 3, 4)],  # 2: 1 has reffed already
        [RefSlotMatch(3, 4, 5)],  # 3: the only team yet to ref
    ]

    assert assign_refs(teams, slots) == {1: 1, 2: 2, 3: 3}


def test_hand_set_refs_are_kept_and_block_that_team_from_the_slots_other_matches():
    teams = [1, 2, 3, 4, 5, 6]
    slots = [
        [
            RefSlotMatch(1, 1, 2),
            RefSlotMatch(2, 3, 4, hand_set=True, ref_team_id=5),
        ]
    ]

    # 5 would win match 1 on seed, but it's reffing match 2 by hand.
    assert assign_refs(teams, slots) == {1: 6}


def test_a_hand_set_na_is_kept():
    teams = [1, 2, 3]
    slots = [[RefSlotMatch(1, 1, 2, hand_set=True, ref_team_id=None)]]

    assert assign_refs(teams, slots) == {}


def _pool_with_schedule(session, tournament_id, name, team_count):
    pool = Pool(tournament_id=tournament_id, name=name)
    session.add(pool)
    session.flush()
    teams = [
        Team(tournament_id=tournament_id, name=f"{name} {seed}", seed=seed, pool_id=pool.id)
        for seed in range(1, team_count + 1)
    ]
    session.add_all(teams)
    session.flush()
    ids = [team.id for team in teams]
    for slot_number, slot in enumerate(generate_round_robin(ids, [1], 1), start=1):
        for position, scheduled in enumerate(slot, start=1):
            session.add(
                Match(
                    tournament_id=tournament_id, bracket="pool", pool_id=pool.id,
                    round=slot_number, position=position,
                    team1_id=scheduled.team1_id, team2_id=scheduled.team2_id,
                    court=scheduled.court, status="complete",
                )
            )
    session.flush()
    return pool


def _refs(session, pool_id):
    return [
        m.ref_team_id
        for m in session.exec(
            select(Match).where(Match.pool_id == pool_id).order_by(Match.round, Match.position)
        ).all()
    ]


def test_backfill_gives_a_ref_less_pool_refs_once_and_leaves_pools_with_refs_alone(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    init_db(engine)
    with Session(engine) as session:
        tournament = Tournament(name="Old Cup")
        session.add(tournament)
        session.flush()
        old = _pool_with_schedule(session, tournament.id, "Old", 4).id
        reffed = _pool_with_schedule(session, tournament.id, "Reffed", 4).id
        first = session.exec(select(Match).where(Match.pool_id == reffed)).first()
        some_team = session.exec(select(Team).where(Team.pool_id == reffed)).first()
        first.ref_team_id = some_team.id
        session.add(first)
        session.commit()
        reffed_before = _refs(session, reffed)

    backfill_pool_refs(engine)

    with Session(engine) as session:
        filled = _refs(session, old)
        # Finished slots get refs too.
        assert None not in filled
        assert _refs(session, reffed) == reffed_before
        first = session.exec(select(Match).where(Match.pool_id == old)).first()
        first.ref_team_id = next(t for t in filled if t != first.ref_team_id)
        session.add(first)
        session.commit()
        edited = _refs(session, old)

    backfill_pool_refs(engine)

    with Session(engine) as session:
        assert _refs(session, old) == edited
