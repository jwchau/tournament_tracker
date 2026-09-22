from sqlmodel import select

from app.models import CorrectionLog
from tests.test_correction import _generate_bracket, _get, _play_all, _score


def _correct(client, match_id, team1_score, team2_score, version):
    return client.patch(
        f"/matches/{match_id}/correct",
        json={"team1_score": team1_score, "team2_score": team2_score, "version": version},
    )


def test_correct_endpoint_returns_corrected_match_and_reset_matches(client):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])

    response = _correct(client, semifinal["id"], 10, 21, semifinal["version"])

    assert response.status_code == 200
    body = response.json()
    assert body["match"]["winner_id"] == semifinal["team2_id"]
    assert [match["id"] for match in body["reset_matches"]] == [ids[(2, 1)]]
    assert body["reset_matches"][0]["winner_id"] is None


def test_correct_endpoint_rejects_stale_version_with_409(client):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])

    response = _correct(client, semifinal["id"], 10, 21, semifinal["version"] - 1)

    assert response.status_code == 409


def test_correct_endpoint_rejects_incomplete_match_with_400(client):
    ids = _generate_bracket(client, 4)
    semifinal = _score(client, ids[(1, 1)], 12, 8, complete=False)

    response = _correct(client, semifinal["id"], 10, 21, semifinal["version"])

    assert response.status_code == 400


def test_correct_endpoint_returns_404_for_missing_match(client):
    assert _correct(client, 999, 10, 21, 1).status_code == 404


def test_preview_endpoint_lists_matches_that_would_be_reset(client):
    ids = _generate_bracket(client, 8)
    _play_all(client, ids)

    response = client.post(
        f"/matches/{ids[(1, 1)]}/correct/preview",
        json={"team1_score": 10, "team2_score": 21},
    )

    assert response.status_code == 200
    assert [match["id"] for match in response.json()["reset_matches"]] == [
        ids[(2, 1)],
        ids[(3, 1)],
    ]
    assert _get(client, ids[(2, 1)])["winner_id"] is not None


def test_preview_endpoint_rejects_tied_score_with_400(client):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)

    response = client.post(
        f"/matches/{ids[(1, 1)]}/correct/preview",
        json={"team1_score": 15, "team2_score": 15},
    )

    assert response.status_code == 400


def test_deleting_the_tournament_removes_its_correction_log(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])
    _correct(client, semifinal["id"], 10, 21, semifinal["version"])

    response = client.delete(f"/tournaments/{semifinal['tournament_id']}")

    assert response.status_code == 204
    assert session.exec(select(CorrectionLog)).all() == []
