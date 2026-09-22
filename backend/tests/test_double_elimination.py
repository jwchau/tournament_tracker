from collections import Counter

from app.bracket import generate_double_elimination


def _round_sizes(matches, bracket):
    counts = Counter(round_ for b, round_, _ in matches if b == bracket)
    return [counts[round_] for round_ in sorted(counts)]


def _feeders(matches):
    """How many links point at each (bracket, round, position, slot)."""
    refs = Counter()
    for match in matches.values():
        for ref in (match.winner_next, match.loser_next):
            if ref is not None:
                refs[ref] += 1
    return refs


def test_four_team_double_elimination_wires_losers_bracket_and_grand_final():
    matches = generate_double_elimination([10, 20, 30, 40])

    assert set(matches) == {
        ("winners", 1, 1),
        ("winners", 1, 2),
        ("winners", 2, 1),
        ("losers", 1, 1),
        ("losers", 2, 1),
        ("grand_final", 1, 1),
    }

    assert matches[("winners", 1, 1)].loser_next == ("losers", 1, 1, 1)
    assert matches[("winners", 1, 2)].loser_next == ("losers", 1, 1, 2)
    assert matches[("winners", 2, 1)].winner_next == ("grand_final", 1, 1, 1)
    assert matches[("winners", 2, 1)].loser_next == ("losers", 2, 1, 2)

    assert matches[("losers", 1, 1)].winner_next == ("losers", 2, 1, 1)
    assert matches[("losers", 1, 1)].loser_next is None
    assert matches[("losers", 2, 1)].winner_next == ("grand_final", 1, 1, 2)

    grand_final = matches[("grand_final", 1, 1)]
    assert grand_final.winner_next is None
    assert grand_final.loser_next is None
    assert grand_final.status == "pending"


def test_eight_team_double_elimination_has_standard_losers_bracket_shape():
    matches = generate_double_elimination(list(range(1, 9)))

    assert _round_sizes(matches, "winners") == [4, 2, 1]
    assert _round_sizes(matches, "losers") == [2, 2, 1, 1]
    assert _round_sizes(matches, "grand_final") == [1]

    assert all(
        match.loser_next is not None for key, match in matches.items() if key[0] == "winners"
    )
    feeders = _feeders(matches)
    for bracket, round_, position in matches:
        if bracket in ("losers", "grand_final"):
            for slot in (1, 2):
                assert feeders[(bracket, round_, position, slot)] == 1, (bracket, round_, position, slot)

    # The first drop round reverses the order losers come down in.
    assert matches[("winners", 2, 1)].loser_next == ("losers", 2, 2, 2)
    assert matches[("winners", 2, 2)].loser_next == ("losers", 2, 1, 2)
    assert matches[("losers", 4, 1)].winner_next == ("grand_final", 1, 1, 2)


def test_two_teams_final_loser_goes_straight_to_the_grand_final():
    matches = generate_double_elimination([10, 20])

    assert set(matches) == {("winners", 1, 1), ("grand_final", 1, 1)}
    assert matches[("winners", 1, 1)].winner_next == ("grand_final", 1, 1, 1)
    assert matches[("winners", 1, 1)].loser_next == ("grand_final", 1, 1, 2)


def _assert_dead(matches, key):
    match = matches[key]
    assert match.status == "complete", key
    assert (match.team1_id, match.team2_id, match.winner_id) == (None, None, None), key
    assert match.winner_next is None, key


def test_five_teams_byes_produce_no_losers_and_empty_losers_matches_are_dead():
    matches = generate_double_elimination([10, 20, 30, 40, 50])
    feeders = _feeders(matches)

    # Seeds 1, 2 and 3 get first-round byes; only 4 vs 5 is a real match.
    for position in (1, 3, 4):
        assert matches[("winners", 1, position)].loser_next is None
    assert matches[("winners", 1, 2)].loser_next == ("losers", 1, 1, 2)

    # Losers round 1 match 1 has one live side; match 2 has none.
    assert feeders[("losers", 1, 1, 1)] == 0
    assert feeders[("losers", 1, 1, 2)] == 1
    assert matches[("losers", 1, 1)].status == "pending"
    _assert_dead(matches, ("losers", 1, 2))
    assert feeders[("losers", 1, 2, 1)] == 0
    assert feeders[("losers", 1, 2, 2)] == 0

    # The dead match feeds nothing, so its slot in the drop round is dead too.
    assert feeders[("losers", 2, 2, 1)] == 0
    assert feeders[("losers", 2, 2, 2)] == 1


def test_nine_teams_dead_losers_matches_leave_dead_slots_in_the_next_round():
    matches = generate_double_elimination(list(range(1, 10)))
    feeders = _feeders(matches)

    assert _round_sizes(matches, "losers") == [4, 4, 2, 2, 1, 1]
    assert matches[("losers", 1, 1)].status == "pending"
    for position in (2, 3, 4):
        _assert_dead(matches, ("losers", 1, position))
        assert feeders[("losers", 2, position, 1)] == 0
        assert feeders[("losers", 2, position, 2)] == 1
    assert all(match.status != "complete" for key, match in matches.items() if key[1] > 1)
