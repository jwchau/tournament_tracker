from tests.test_court_dispatch_api import _bracket, _complete, _get
from tests.test_playoff_advancement_api import _advance, _play, _setup
from tests.test_pools_api import _generate_schedule, _pool_matches, _pool_with_teams


def _courts(client, tournament_id):
    response = client.get(f"/tournaments/{tournament_id}/courts")
    assert response.status_code == 200, response.json()
    return response.json()


def _ids(matches):
    return [match["id"] for match in matches]


def _pool_court_schedule(client, pool_id, court):
    """The court's unfinished pool matches in schedule order."""
    return [
        m
        for m in _pool_matches(client, pool_id)
        if m["court"] == court and m["status"] != "complete"
    ]


def test_a_pool_court_plays_its_matches_in_schedule_order(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 5, court_count=2)
    _generate_schedule(client, pool["id"])
    schedule = _pool_court_schedule(client, pool["id"], 1)

    court = _courts(client, tournament_id)[0]

    assert (court["court"], court["use"], court["label"]) == (1, "pool", "Pool 1")
    assert court["current"]["id"] == schedule[0]["id"]
    assert _ids(court["up_next"]) == _ids(schedule[1:4])


def test_completing_the_current_match_moves_the_queue_along(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 5, court_count=2)
    _generate_schedule(client, pool["id"])
    before = _courts(client, tournament_id)[1]

    _complete(client, before["current"]["id"])

    after = _courts(client, tournament_id)[1]
    assert after["current"]["id"] == before["up_next"][0]["id"]
    assert _ids(after["up_next"])[:2] == _ids(before["up_next"])[1:3]


def test_playoff_courts_show_the_dispatched_match_and_the_brackets_queue(client):
    ids = _bracket(client, 8, court_count=2)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    tournament_id = _get(client, r1[0])["tournament_id"]

    first, second = _courts(client, tournament_id)

    assert (first["use"], first["label"]) == ("playoff", "Bracket 1")
    assert (first["current"]["id"], second["current"]["id"]) == (r1[0], r1[1])
    # Both courts share the bracket's queue: its next match takes whichever frees first.
    assert _ids(first["up_next"]) == _ids(second["up_next"]) == r1[2:]

    _complete(client, r1[1])

    assert _courts(client, tournament_id)[1]["current"]["id"] == r1[2]


def test_each_match_carries_what_the_score_form_needs(client):
    ids = _bracket(client, 4, court_count=1)
    match = _get(client, ids[("winners", 1, 1)])

    current = _courts(client, match["tournament_id"])[0]["current"]

    assert current["team1_name"] == "Team 1"
    assert current["team2_name"] == "Team 4"
    assert (current["best_of"], current["version"], current["status"]) == (1, 1, "ready")


def test_a_best_of_series_reports_its_length(client):
    tournament_id, [pool], _ = _pool_with_teams(client, 2, court_count=1)
    client.patch(f"/tournaments/{tournament_id}", json={"playoff_best_of": 3})
    _generate_schedule(client, pool["id"])
    [pool_match] = _pool_matches(client, pool["id"])
    assert _courts(client, tournament_id)[0]["current"]["best_of"] == 1

    _complete(client, pool_match["id"])
    client.post(
        f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": "single"}
    )

    court = _courts(client, tournament_id)[0]
    assert court["use"] == "playoff"
    assert court["current"]["best_of"] == 3


def test_a_court_with_nothing_left_reports_that_it_is_empty(client):
    ids = _bracket(client, 2, court_count=2)
    final = ids[("winners", 1, 1)]
    tournament_id = _get(client, final)["tournament_id"]

    idle = _courts(client, tournament_id)[1]
    assert (idle["current"], idle["up_next"]) == (None, [])

    _complete(client, final)

    assert [(c["current"], c["up_next"]) for c in _courts(client, tournament_id)] == [
        (None, []),
        (None, []),
    ]


def test_courts_follow_the_pool_split_and_are_unused_before_there_are_pools(client):
    tournament_id, _, _ = _pool_with_teams(client, 0, court_count=3, pool_count=0)

    assert [(c["court"], c["use"], c["label"]) for c in _courts(client, tournament_id)] == [
        (1, None, None),
        (2, None, None),
        (3, None, None),
    ]

    for name in ("Pool A", "Pool B"):
        client.post(f"/tournaments/{tournament_id}/pools", json={"name": name})

    assert [(c["court"], c["use"], c["label"]) for c in _courts(client, tournament_id)] == [
        (1, "pool", "Pool A"),
        (2, "pool", "Pool A"),
        (3, "pool", "Pool B"),
    ]


def test_courts_of_a_missing_tournament_is_404(client):
    assert client.get("/tournaments/999/courts").status_code == 404


def test_held_matches_are_left_out_of_up_next(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    tournament_id = _get(client, r1[0])["tournament_id"]
    client.patch(f"/matches/{r1[2]}/hold", json={"on_hold": True, "version": 1})

    [court] = _courts(client, tournament_id)

    assert court["current"]["id"] == r1[0]
    assert _ids(court["up_next"]) == [r1[1], r1[3]]


def test_a_bracket_without_courts_waits_in_line_on_the_courts_it_shares(client):
    # One court, two brackets: bracket 2 owns none, so its matches queue for court 1.
    tournament_id, [pool], _ = _setup(
        client, [4], advance_per_pool=2, playoff_bracket_count=2, court_count=1
    )
    _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id).json()
    [first_final] = client.get(f"/playoff-brackets/{tier_one['id']}/matches").json()
    [second_final] = client.get(f"/playoff-brackets/{tier_two['id']}/matches").json()

    [court] = _courts(client, tournament_id)

    assert (court["use"], court["label"]) == ("playoff", "Bracket 1")
    assert court["current"]["id"] == first_final["id"]
    assert _ids(court["up_next"]) == [second_final["id"]]


def test_a_shared_court_names_the_bracket_it_is_playing(client):
    # Bracket 2 owns no courts; once bracket 1's final finishes, court 1 plays bracket 2's.
    tournament_id, [pool], _ = _setup(
        client, [4], advance_per_pool=2, playoff_bracket_count=2, court_count=1
    )
    _play(client, pool["id"])
    tier_one, tier_two = _advance(client, tournament_id).json()
    [first_final] = client.get(f"/playoff-brackets/{tier_one['id']}/matches").json()
    [second_final] = client.get(f"/playoff-brackets/{tier_two['id']}/matches").json()
    _complete(client, first_final["id"])

    [court] = _courts(client, tournament_id)

    assert court["current"]["id"] == second_final["id"]
    assert (court["label"], court["now_playing"]) == ("Bracket 1", "Bracket 2")


def test_a_court_playing_its_own_bracket_has_nothing_extra_to_say(client):
    tournament_id, [pool], _ = _setup(
        client, [4], advance_per_pool=2, playoff_bracket_count=2, court_count=1
    )
    _play(client, pool["id"])
    _advance(client, tournament_id)

    [court] = _courts(client, tournament_id)

    assert (court["label"], court["now_playing"]) == ("Bracket 1", None)


def test_a_match_set_by_hand_behind_the_one_playing_is_up_next_on_that_court(client):
    ids = _bracket(client, 8, court_count=1)
    r1 = [ids[("winners", 1, position)] for position in range(1, 5)]
    playing = _get(client, r1[0])
    client.patch(
        f"/matches/{r1[0]}/score",
        json={"team1_score": 3, "team2_score": 2, "version": playing["version"]},
    )
    client.patch(f"/matches/{r1[3]}/schedule", json={"court": 1})

    [court] = _courts(client, playing["tournament_id"])

    assert court["current"]["id"] == r1[0]
    assert _ids(court["up_next"]) == [r1[3], r1[1], r1[2]]
