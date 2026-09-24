from tests.test_correction import _generate_bracket, _get, _score


def _schedule(client, match_id, **fields):
    return client.patch(f"/matches/{match_id}/schedule", json=fields)


def test_setting_a_court_and_time_persists_on_the_match(client):
    ids = _generate_bracket(client, 4)
    match_id = ids[(1, 1)]

    response = _schedule(client, match_id, court=1, scheduled_time="2026-10-03T10:30:00")

    assert response.status_code == 200
    match = _get(client, match_id)
    assert match["court"] == 1
    assert match["scheduled_time"] == "2026-10-03T10:30:00"


def test_only_the_fields_sent_change_and_null_clears_one(client):
    ids = _generate_bracket(client, 4)
    # The final: not ready yet, so court dispatch leaves it alone.
    match_id = ids[(2, 1)]
    _schedule(client, match_id, court=1, scheduled_time="2026-10-03T10:30:00")

    _schedule(client, match_id, scheduled_time="2026-10-03T11:00:00")
    match = _get(client, match_id)
    assert (match["court"], match["scheduled_time"]) == (1, "2026-10-03T11:00:00")

    _schedule(client, match_id, court=None)
    match = _get(client, match_id)
    assert (match["court"], match["scheduled_time"]) == (None, "2026-10-03T11:00:00")


def test_court_must_be_one_of_the_tournaments_courts(client):
    ids = _generate_bracket(client, 4)
    match = _get(client, ids[(1, 1)])

    assert _schedule(client, match["id"], court=0).status_code == 400
    assert _schedule(client, match["id"], court=2).status_code == 400
    # Still on the court dispatch gave it.
    assert _get(client, match["id"])["court"] == match["court"]

    client.patch(f"/tournaments/{match['tournament_id']}", json={"court_count": 3})
    assert _schedule(client, match["id"], court=3).status_code == 200


def test_scheduling_leaves_score_status_and_version_alone(client):
    ids = _generate_bracket(client, 4)
    match_id = ids[(1, 1)]
    in_progress = _score(client, match_id, 12, 8, complete=False)

    _schedule(client, match_id, court=1, scheduled_time="2026-10-03T10:30:00")

    match = _get(client, match_id)
    assert match["version"] == in_progress["version"]
    assert (match["team1_score"], match["team2_score"], match["status"]) == (12, 8, "in_progress")

    # A scorekeeper who loaded the match before the schedule edit can still submit.
    response = client.patch(
        f"/matches/{match_id}/score",
        json={
            "team1_score": 21,
            "team2_score": 15,
            "version": in_progress["version"],
            "complete": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["court"] == 1


def test_scheduling_a_missing_match_returns_404(client):
    assert _schedule(client, 999, court=1).status_code == 404
