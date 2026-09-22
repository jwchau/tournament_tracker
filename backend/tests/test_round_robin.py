from collections import Counter
from itertools import combinations

import pytest

from app.pools import generate_round_robin


def _runs(slots, teams):
    """Each team's consecutive playing/idle runs, as lengths in slots."""
    runs = {}
    for team in teams:
        states = [
            any(team in (match.team1_id, match.team2_id) for match in slot) for slot in slots
        ]
        lengths, current = [], 1
        for previous, state in zip(states, states[1:]):
            if state == previous:
                current += 1
            else:
                lengths.append(current)
                current = 1
        lengths.append(current)
        runs[team] = lengths
    return runs


def _violations(slots, teams):
    """Slots beyond the 2-in-a-row limit, summed over every team's runs."""
    return sum(max(0, length - 2) for lengths in _runs(slots, teams).values() for length in lengths)


def _pairs(slots):
    return Counter(
        frozenset((match.team1_id, match.team2_id)) for slot in slots for match in slot
    )


CONFIGS = [(4, [1], 1), (5, [1, 2], 2), (6, [3, 4], 1), (7, [1, 2, 3], 3), (2, [1], 2)]


@pytest.mark.parametrize("team_count, courts, n", CONFIGS)
def test_every_pair_plays_exactly_n_times(team_count, courts, n):
    teams = list(range(1, team_count + 1))

    slots = generate_round_robin(teams, courts, n)

    assert sum(len(slot) for slot in slots) == n * team_count * (team_count - 1) // 2
    assert _pairs(slots) == Counter({frozenset(pair): n for pair in combinations(teams, 2)})


@pytest.mark.parametrize("team_count, courts, n", CONFIGS)
def test_each_pairing_plays_back_to_back_on_one_court_and_slots_are_valid(
    team_count, courts, n
):
    slots = generate_round_robin(list(range(1, team_count + 1)), courts, n)

    appearances = {}
    for index, slot in enumerate(slots):
        assert 1 <= len(slot) <= len(courts)
        playing = [team for match in slot for team in (match.team1_id, match.team2_id)]
        assert len(playing) == len(set(playing)), f"a team plays twice in slot {index}"
        assert len({match.court for match in slot}) == len(slot)
        for match in slot:
            assert match.court in courts
            pair = frozenset((match.team1_id, match.team2_id))
            appearances.setdefault(pair, []).append((index, match.court))

    for pair, seen in appearances.items():
        indexes = [index for index, _ in seen]
        assert indexes == list(range(indexes[0], indexes[0] + n)), pair
        assert len({court for _, court in seen}) == 1, pair


@pytest.mark.parametrize(
    "team_count, courts, n, expected_slots",
    [
        (5, [1, 2], 1, 5),  # 10 pairings, 2 at a time
        (6, [1, 2, 3], 1, 5),  # 15 pairings, 3 at a time
        (6, [1, 2], 1, 8),  # 15 pairings, 2 at a time: 7 full slots + 1
        (4, [1, 2], 2, 6),  # 3 rounds of 2 pairings, each pairing twice
    ],
)
def test_courts_are_filled_so_the_pool_finishes_as_fast_as_possible(
    team_count, courts, n, expected_slots
):
    slots = generate_round_robin(list(range(1, team_count + 1)), courts, n)

    assert len(slots) == expected_slots


# Configurations where a perfect schedule exists. Many don't: with n >= 2 a
# round lasts n slots, so a team can never play or sit out two rounds in a
# row, which 4 teams on 1 court can't manage (after AB then CD the only
# pairing free of C and D is AB again); and 6 teams on 1 court would need
# every team on a strict play-idle-idle cycle, leaving each team only one
# possible opponent.
@pytest.mark.parametrize(
    "team_count, courts, n",
    [(4, [1], 1), (5, [1], 1), (8, [1, 2], 1), (2, [1], 2)],
)
def test_no_team_plays_or_idles_more_than_two_slots_in_a_row_when_avoidable(
    team_count, courts, n
):
    teams = list(range(1, team_count + 1))

    slots = generate_round_robin(teams, courts, n)

    assert _violations(slots, teams) == 0


def test_with_n_of_three_the_only_playing_violation_is_the_unavoidable_block():
    teams = [1, 2, 3, 4, 5]

    slots = generate_round_robin(teams, [1], 3)

    # Every pairing block forces its two teams to play 3 slots in a row -
    # accepted by design - but no team plays two blocks back-to-back, so no
    # playing run is ever longer than that.
    playing_runs = []
    for team in teams:
        states = [any(team in (m.team1_id, m.team2_id) for m in slot) for slot in slots]
        lengths = _runs(slots, [team])[team]
        starts_playing = states[0]
        playing_runs += lengths[0 if starts_playing else 1 :: 2]
    assert set(playing_runs) == {3}


def test_with_an_odd_team_count_each_team_sits_out_once_per_full_rotation():
    teams = [1, 2, 3, 4, 5]

    slots = generate_round_robin(teams, [1, 2], 1)

    assert all(len(slot) == 2 for slot in slots)
    sat_out = Counter(
        team
        for slot in slots
        for team in teams
        if team not in {t for match in slot for t in (match.team1_id, match.team2_id)}
    )
    assert sat_out == Counter({team: 1 for team in teams})
