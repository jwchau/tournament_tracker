from tests.helpers import create_tournament


def _scheduled_pool(client, team_count, court_count):
    """One pool holding `team_count` seeded teams on `court_count` courts, with its schedule."""
    tournament = create_tournament(client, "Ref Cup")
    client.patch(f"/tournaments/{tournament['id']}", json={"court_count": court_count})
    pool = client.post(f"/tournaments/{tournament['id']}/pools", json={"name": "Pool A"}).json()
    teams = []
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament['id']}/teams", json={"name": f"Seed {seed}", "seed": seed}
        ).json()
        client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
        teams.append(team)
    assert client.post(f"/pools/{pool['id']}/generate-schedule").status_code == 201
    return tournament["id"], pool, [team["id"] for team in teams]


def _matches(client, pool_id):
    return client.get(f"/pools/{pool_id}/matches").json()


def _set_ref(client, match, ref_team_id=None, automatic=False, version=None):
    return client.patch(
        f"/matches/{match['id']}/ref",
        json={
            "ref_team_id": ref_team_id,
            "automatic": automatic,
            "version": match["version"] if version is None else version,
        },
    )


def _idle(matches, round_, team_ids):
    playing = {t for m in matches if m["round"] == round_ for t in (m["team1_id"], m["team2_id"])}
    return [t for t in team_ids if t not in playing]


def test_a_generated_schedule_gives_every_match_an_automatic_ref_from_the_idle_teams(client):
    _, pool, team_ids = _scheduled_pool(client, 5, court_count=1)

    matches = _matches(client, pool["id"])

    for match in matches:
        assert match["ref_team_id"] in _idle(matches, match["round"], team_ids)
        assert match["ref_set_at"] is None


def test_four_teams_on_two_courts_have_no_refs(client):
    _, pool, _ = _scheduled_pool(client, 4, court_count=2)

    assert {m["ref_team_id"] for m in _matches(client, pool["id"])} == {None}


def test_an_organizer_can_set_a_ref_then_na_then_go_back_to_automatic(client):
    _, pool, team_ids = _scheduled_pool(client, 5, court_count=1)
    matches = _matches(client, pool["id"])
    match = matches[0]
    automatic_ref = match["ref_team_id"]
    other = next(t for t in _idle(matches, match["round"], team_ids) if t != automatic_ref)

    response = _set_ref(client, match, other)
    assert response.status_code == 200
    by_hand = response.json()
    assert by_hand["ref_team_id"] == other
    assert by_hand["ref_set_at"] is not None
    assert by_hand["version"] == match["version"] + 1

    na = _set_ref(client, by_hand, None).json()
    assert na["ref_team_id"] is None and na["ref_set_at"] is not None

    back = _set_ref(client, na, automatic=True).json()
    assert back["ref_team_id"] == automatic_ref and back["ref_set_at"] is None


def test_a_stale_version_is_a_conflict(client):
    _, pool, _ = _scheduled_pool(client, 5, court_count=1)
    match = _matches(client, pool["id"])[0]

    response = _set_ref(client, match, None, version=match["version"] + 5)

    assert response.status_code == 409


def test_a_team_in_the_match_or_playing_in_the_same_slot_cannot_ref(client):
    _, pool, _ = _scheduled_pool(client, 5, court_count=2)
    matches = _matches(client, pool["id"])
    match, neighbour = [m for m in matches if m["round"] == 1]

    assert _set_ref(client, match, match["team1_id"]).status_code == 400
    assert _set_ref(client, match, neighbour["team2_id"]).status_code == 400


def test_a_team_from_another_pool_cannot_ref(client):
    tournament_id, pool, _ = _scheduled_pool(client, 5, court_count=1)
    outsider = client.post(f"/tournaments/{tournament_id}/teams", json={"name": "Outsider"}).json()
    match = _matches(client, pool["id"])[0]

    assert _set_ref(client, match, outsider["id"]).status_code == 400


def test_refs_stay_editable_after_the_match_is_finished(client):
    _, pool, team_ids = _scheduled_pool(client, 5, court_count=1)
    matches = _matches(client, pool["id"])
    match = matches[0]
    finished = client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 21, "team2_score": 15, "version": match["version"], "complete": True},
    ).json()
    other = next(t for t in _idle(matches, match["round"], team_ids) if t != match["ref_team_id"])

    response = _set_ref(client, finished, other)

    assert response.status_code == 200
    assert response.json()["ref_team_id"] == other


def test_picking_another_courts_ref_moves_that_court_to_the_next_idle_team(client):
    _, pool, team_ids = _scheduled_pool(client, 6, court_count=2)
    matches = _matches(client, pool["id"])
    first, second = [m for m in matches if m["round"] == 1]

    _set_ref(client, first, second["ref_team_id"])

    after = {m["id"]: m for m in _matches(client, pool["id"])}
    assert after[first["id"]]["ref_team_id"] == second["ref_team_id"]
    assert after[second["id"]]["ref_team_id"] == first["ref_team_id"]
    # The other court's version is untouched, so its scorekeeper isn't sent a conflict.
    assert after[second["id"]]["version"] == second["version"]


def test_hand_set_refs_survive_reassignment_from_another_override(client):
    _, pool, team_ids = _scheduled_pool(client, 6, court_count=2)
    matches = _matches(client, pool["id"])
    [slot1_a, _] = [m for m in matches if m["round"] == 1]
    [slot2_a, slot2_b] = [m for m in matches if m["round"] == 2]
    _set_ref(client, slot2_a, None)

    # Taking slot 1's refs off automatic reshuffles every later automatic ref.
    _set_ref(client, slot1_a, None)

    after = {m["id"]: m for m in _matches(client, pool["id"])}
    assert after[slot2_a["id"]]["ref_team_id"] is None
    assert after[slot2_a["id"]]["ref_set_at"] is not None
    assert after[slot2_b["id"]]["ref_team_id"] in _idle(matches, 2, team_ids)


def test_regenerating_a_schedule_recomputes_its_refs(client):
    _, pool, _ = _scheduled_pool(client, 5, court_count=1)
    _set_ref(client, _matches(client, pool["id"])[0], None)

    client.post(f"/pools/{pool['id']}/generate-schedule")

    matches = _matches(client, pool["id"])
    assert all(m["ref_set_at"] is None and m["ref_team_id"] is not None for m in matches)


def test_the_court_list_carries_each_matchs_ref(client):
    tournament_id, pool, _ = _scheduled_pool(client, 5, court_count=1)
    first = _matches(client, pool["id"])[0]

    [court] = client.get(f"/tournaments/{tournament_id}/courts").json()

    assert court["current"]["ref_team_id"] == first["ref_team_id"]
    ref_name = client.get(f"/teams/{first['ref_team_id']}").json()["name"]
    assert court["current"]["ref_name"] == ref_name
    assert court["current"]["ref_set_at"] is None


def test_signed_out_visitors_cannot_change_a_ref(client, anonymous_client):
    _, pool, _ = _scheduled_pool(client, 5, court_count=1)
    match = _matches(client, pool["id"])[0]

    assert _set_ref(anonymous_client, match, None).status_code == 401


def test_ref_options_for_a_pool_match_are_its_pools_teams_free_that_slot(client):
    _, pool, team_ids = _scheduled_pool(client, 5, court_count=2)
    matches = _matches(client, pool["id"])
    match = matches[0]

    options = client.get(f"/matches/{match['id']}/ref-options").json()

    assert [team["id"] for team in options] == _idle(matches, match["round"], team_ids)
