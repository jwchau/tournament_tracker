"""The hot reads are built from plain rows (see app.rows), not through their response models.

A response written by hand can drift from its model: a missing or extra key, a date in a
different format. So each is checked against the model it documents: the JSON must
validate as that model and dump back to exactly the same JSON.
"""

from pydantic import TypeAdapter

from app.court_routes import CourtSummary
from app.models import Match, TournamentDetail
from app.playoff_routes import DispatchStatus
from app.pool_routes import StandingsEntry
from tests.test_playoff_advancement_api import _advance, _play, _setup


def _same_as_its_model(response, annotation):
    assert response.status_code == 200, response.text
    adapter = TypeAdapter(annotation)
    data = response.json()
    assert adapter.dump_python(adapter.validate_python(data), mode="json") == data
    return data


def _tournament_in_pool_play(client):
    tournament_id, pools, _ = _setup(client, [4, 4], advance_per_pool=2, playoff_bracket_count=2)
    client.patch(f"/tournaments/{tournament_id}", json={"date": "2026-10-03", "venue": "Riverside"})
    matches = client.get(f"/pools/{pools[0]['id']}/matches").json()
    client.patch(
        f"/matches/{matches[0]['id']}/schedule", json={"scheduled_time": "2026-10-03T10:30:00"}
    )
    return tournament_id, pools


def test_pool_reads_in_pool_play_match_their_models(client):
    tournament_id, pools = _tournament_in_pool_play(client)
    pool_id = pools[0]["id"]

    matches = _same_as_its_model(client.get(f"/pools/{pool_id}/matches"), list[Match])
    assert matches[0]["scheduled_time"] == "2026-10-03T10:30:00"
    assert [(m["round"], m["position"]) for m in matches] == sorted((m["round"], m["position"]) for m in matches)
    standings = _same_as_its_model(client.get(f"/pools/{pool_id}/standings"), list[StandingsEntry])
    assert [entry["rank"] for entry in standings] == [1, 2, 3, 4]
    detail = _same_as_its_model(client.get(f"/tournaments/{tournament_id}"), TournamentDetail)
    assert (detail["date"], detail["venue"]) == ("2026-10-03", "Riverside")
    courts = _same_as_its_model(client.get(f"/tournaments/{tournament_id}/courts"), list[CourtSummary])
    assert {court["use"] for court in courts} == {"pool"}
    assert any(court["current"] and court["current"]["scheduled_time"] for court in courts)


def test_reads_once_a_match_has_been_scored_match_their_models(client):
    tournament_id, pools = _tournament_in_pool_play(client)
    first = client.get(f"/pools/{pools[0]['id']}/matches").json()[0]
    client.patch(
        f"/matches/{first['id']}/score",
        json={"team1_score": 21, "team2_score": 17, "version": first["version"], "complete": True},
    )

    standings = _same_as_its_model(client.get(f"/pools/{pools[0]['id']}/standings"), list[StandingsEntry])
    assert sum(entry["played"] for entry in standings) == 2
    detail = _same_as_its_model(client.get(f"/tournaments/{tournament_id}"), TournamentDetail)
    assert detail["pool_play_started"] is True
    assert "games_per_pairing" in detail["setting_locks"]


def test_playoff_reads_match_their_models(client):
    tournament_id, pools = _tournament_in_pool_play(client)
    for pool in pools:
        _play(client, pool["id"])
    _advance(client, tournament_id)
    brackets = client.get(f"/tournaments/{tournament_id}/playoff-brackets").json()

    for bracket in brackets:
        matches = _same_as_its_model(client.get(f"/playoff-brackets/{bracket['id']}/matches"), list[Match])
        assert matches
        dispatch = _same_as_its_model(client.get(f"/playoff-brackets/{bracket['id']}/dispatch"), DispatchStatus)
        assert dispatch["courts"]
    courts = _same_as_its_model(client.get(f"/tournaments/{tournament_id}/courts"), list[CourtSummary])
    assert {court["use"] for court in courts} == {"playoff"}
    current = [court["current"] for court in courts if court["current"]]
    assert current and all(match["best_of"] == 1 for match in current)
    assert any(court["up_next"] for court in courts)
    _same_as_its_model(client.get(f"/tournaments/{tournament_id}"), TournamentDetail)


def test_a_missing_pool_or_bracket_is_still_a_404(client):
    assert client.get("/pools/999/matches").status_code == 404
    assert client.get("/pools/999/standings").status_code == 404
    assert client.get("/playoff-brackets/999/matches").status_code == 404
    assert client.get("/playoff-brackets/999/dispatch").status_code == 404
    assert client.get("/tournaments/999").status_code == 404
    assert client.get("/tournaments/999/courts").status_code == 404
