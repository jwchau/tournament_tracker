import pytest

from tests.helpers import create_tournament


def _unconfirmed_tournament(client):
    return client.post("/tournaments", json={"name": "Fall Open"}).json()["id"]


def _confirm(client, tournament_id):
    return client.post(f"/tournaments/{tournament_id}/confirm-settings")


def test_teams_can_only_be_added_once_the_settings_are_confirmed(client):
    tournament_id = _unconfirmed_tournament(client)
    assert client.get(f"/tournaments/{tournament_id}").json()["settings_confirmed"] is False

    refused = client.post(f"/tournaments/{tournament_id}/teams", json={"name": "Aces"})
    confirmed = _confirm(client, tournament_id)
    allowed = client.post(f"/tournaments/{tournament_id}/teams", json={"name": "Aces"})

    assert refused.status_code == 400
    assert "confirm the tournament settings" in refused.json()["detail"]
    assert confirmed.status_code == 200 and confirmed.json()["settings_confirmed"] is True
    assert allowed.status_code == 201


def test_pools_and_brackets_also_wait_for_confirmed_settings(client):
    tournament_id = _unconfirmed_tournament(client)

    responses = [
        client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Pool A"}),
        client.post(f"/tournaments/{tournament_id}/pools/auto-assign"),
        client.post(f"/tournaments/{tournament_id}/bracket/generate"),
        client.post(f"/tournaments/{tournament_id}/advance-to-playoffs", json={"format": "single"}),
    ]
    readiness = client.get(f"/tournaments/{tournament_id}/playoff-readiness").json()

    assert [r.status_code for r in responses] == [400, 400, 400, 400]
    assert all("confirm the tournament settings" in r.json()["detail"] for r in responses)
    assert readiness == {"ready": False, "reason": "confirm the tournament settings first"}
    assert client.get(f"/tournaments/{tournament_id}/pools").json() == []


def _first_match_with_a_pool(client, tournament_id):
    pool = client.post(f"/tournaments/{tournament_id}/pools", json={"name": "Pool A"}).json()
    for name in ("Aces", "Blockers"):
        team = client.post(f"/tournaments/{tournament_id}/teams", json={"name": name}).json()
        client.patch(f"/teams/{team['id']}", json={"pool_id": pool["id"]})
    return client.post(f"/pools/{pool['id']}/generate-schedule").json()[0]


def _first_match_in_a_bracket(client, tournament_id):
    for name in ("Aces", "Blockers"):
        team = client.post(f"/tournaments/{tournament_id}/teams", json={"name": name}).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"{name} Captain"})
    return client.post(f"/tournaments/{tournament_id}/bracket/generate").json()[0]


@pytest.mark.parametrize("first_match", [_first_match_with_a_pool, _first_match_in_a_bracket])
def test_settings_lock_once_any_match_has_a_score_but_the_name_stays_editable(client, first_match):
    tournament_id = create_tournament(client, "Fall Open")["id"]
    match = first_match(client, tournament_id)
    assert client.patch(f"/tournaments/{tournament_id}", json={"court_count": 3}).status_code == 200
    assert client.get(f"/tournaments/{tournament_id}").json()["settings_locked"] is False

    client.patch(
        f"/matches/{match['id']}/score",
        json={"team1_score": 5, "team2_score": 3, "version": match["version"], "complete": False},
    )
    refused = client.patch(f"/tournaments/{tournament_id}", json={"court_count": 5})
    # The settings form sends every field; unchanged settings alongside a new name are fine.
    renamed = client.patch(
        f"/tournaments/{tournament_id}", json={"name": "Fall Open 2026", "court_count": 3}
    )

    assert refused.status_code == 400 and "play has started" in refused.json()["detail"]
    assert renamed.status_code == 200
    tournament = client.get(f"/tournaments/{tournament_id}").json()
    assert (tournament["name"], tournament["court_count"], tournament["settings_locked"]) == (
        "Fall Open 2026",
        3,
        True,
    )
