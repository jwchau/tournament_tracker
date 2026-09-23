import pytest
from sqlmodel import select

from app.models import CorrectionLog
from app.scoring import (
    InvalidScore,
    MatchNotFound,
    VersionConflict,
    correct_score,
    preview_correction,
)
from tests.helpers import create_tournament


def _generate_bracket(client, team_count):
    tournament = create_tournament(client, "Correction Cup")
    for seed in range(1, team_count + 1):
        team = client.post(
            f"/tournaments/{tournament['id']}/teams",
            json={"name": f"Team {seed}", "seed": seed},
        ).json()
        client.post(f"/teams/{team['id']}/players", json={"name": f"Player {seed}"})
    matches = client.post(f"/tournaments/{tournament['id']}/bracket/generate").json()
    return {(m["round"], m["position"]): m["id"] for m in matches}


def _get(client, match_id):
    return client.get(f"/matches/{match_id}").json()


def _score(client, match_id, team1_score, team2_score, complete=True):
    match = _get(client, match_id)
    response = client.patch(
        f"/matches/{match_id}/score",
        json={
            "team1_score": team1_score,
            "team2_score": team2_score,
            "version": match["version"],
            "complete": complete,
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()


def _play_all(client, ids):
    """Play every match in round order; team1 always wins 21-10."""
    for key in sorted(ids):
        _score(client, ids[key], 21, 10)


def test_correcting_round_one_winner_resets_the_final_with_the_new_winner(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])
    loser = semifinal["team2_id"]

    correct_score(
        session,
        semifinal["id"],
        team1_score=10,
        team2_score=21,
        expected_version=semifinal["version"],
    )

    final = _get(client, ids[(2, 1)])
    slot = "team1_id" if semifinal["winner_next_slot"] == 1 else "team2_id"
    assert final[slot] == loser
    assert final["team1_score"] is None
    assert final["team2_score"] is None
    assert final["winner_id"] is None
    assert final["status"] == "ready"


def test_correction_is_logged_with_old_and_new_result_and_reset_matches(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])

    correction = correct_score(
        session,
        semifinal["id"],
        team1_score=10,
        team2_score=21,
        expected_version=semifinal["version"],
    )

    logs = session.exec(select(CorrectionLog)).all()
    assert logs == [correction.log]
    log = logs[0]
    assert log.match_id == semifinal["id"]
    assert (log.old_team1_score, log.old_team2_score) == (21, 10)
    assert log.old_winner_id == semifinal["team1_id"]
    assert (log.new_team1_score, log.new_team2_score) == (10, 21)
    assert log.new_winner_id == semifinal["team2_id"]
    assert log.reset_match_ids == [ids[(2, 1)]]
    assert log.created_at is not None


def test_correction_cascades_through_every_played_round_to_the_final(client, session):
    ids = _generate_bracket(client, 8)
    _play_all(client, ids)
    quarterfinal = _get(client, ids[(1, 1)])
    semifinal = _get(client, ids[(2, 1)])
    other_finalist = _get(client, ids[(2, 2)])["winner_id"]

    correction = correct_score(
        session,
        quarterfinal["id"],
        team1_score=10,
        team2_score=21,
        expected_version=quarterfinal["version"],
    )

    assert sorted(correction.log.reset_match_ids) == sorted([ids[(2, 1)], ids[(3, 1)]])

    reset_semifinal = _get(client, ids[(2, 1)])
    semi_slot = "team1_id" if quarterfinal["winner_next_slot"] == 1 else "team2_id"
    assert reset_semifinal[semi_slot] == quarterfinal["team2_id"]
    assert reset_semifinal["winner_id"] is None
    assert reset_semifinal["status"] == "ready"

    final = _get(client, ids[(3, 1)])
    final_slot = "team1_id" if semifinal["winner_next_slot"] == 1 else "team2_id"
    other_slot = "team2_id" if final_slot == "team1_id" else "team1_id"
    assert final[final_slot] is None
    assert final[other_slot] == other_finalist
    assert final["team1_score"] is None
    assert final["team2_score"] is None
    assert final["winner_id"] is None
    assert final["status"] == "pending"


def test_in_progress_downstream_match_is_reset(client, session):
    ids = _generate_bracket(client, 4)
    _score(client, ids[(1, 1)], 21, 10)
    _score(client, ids[(1, 2)], 21, 10)
    _score(client, ids[(2, 1)], 12, 8, complete=False)
    semifinal = _get(client, ids[(1, 1)])

    correction = correct_score(
        session,
        semifinal["id"],
        team1_score=10,
        team2_score=21,
        expected_version=semifinal["version"],
    )

    assert correction.log.reset_match_ids == [ids[(2, 1)]]
    final = _get(client, ids[(2, 1)])
    assert final["team1_score"] is None
    assert final["team2_score"] is None
    assert final["status"] == "ready"


def test_correction_that_keeps_the_same_winner_resets_nothing(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    semifinal = _get(client, ids[(1, 1)])
    final_before = _get(client, ids[(2, 1)])

    correction = correct_score(
        session,
        semifinal["id"],
        team1_score=25,
        team2_score=23,
        expected_version=semifinal["version"],
    )

    assert correction.reset_matches == []
    assert correction.log.reset_match_ids == []
    assert (correction.match.team1_score, correction.match.team2_score) == (25, 23)
    assert _get(client, ids[(2, 1)]) == final_before


def test_downstream_score_submitted_against_pre_correction_version_is_rejected(
    client, session
):
    ids = _generate_bracket(client, 4)
    _score(client, ids[(1, 1)], 21, 10)
    _score(client, ids[(1, 2)], 21, 10)
    final_seen_by_scorekeeper = _get(client, ids[(2, 1)])
    semifinal = _get(client, ids[(1, 1)])

    correct_score(
        session,
        semifinal["id"],
        team1_score=10,
        team2_score=21,
        expected_version=semifinal["version"],
    )
    response = client.patch(
        f"/matches/{ids[(2, 1)]}/score",
        json={
            "team1_score": 21,
            "team2_score": 10,
            "version": final_seen_by_scorekeeper["version"],
            "complete": True,
        },
    )

    assert response.status_code == 409
    assert _get(client, ids[(2, 1)])["winner_id"] is None


def test_preview_lists_what_the_correction_will_reset_without_changing_anything(
    client, session
):
    ids = _generate_bracket(client, 8)
    _play_all(client, ids)
    before = {key: _get(client, match_id) for key, match_id in ids.items()}
    quarterfinal = before[(1, 1)]

    preview = preview_correction(session, quarterfinal["id"], 10, 21)

    assert {key: _get(client, match_id) for key, match_id in ids.items()} == before
    assert session.exec(select(CorrectionLog)).all() == []

    correction = correct_score(
        session, quarterfinal["id"], 10, 21, expected_version=quarterfinal["version"]
    )
    assert [match.id for match in preview] == correction.log.reset_match_ids


def test_preview_is_empty_when_the_winner_does_not_change(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)

    assert preview_correction(session, ids[(1, 1)], 25, 23) == []


def test_only_completed_matches_can_be_corrected(client, session):
    ids = _generate_bracket(client, 4)
    semifinal = _score(client, ids[(1, 1)], 12, 8, complete=False)

    with pytest.raises(InvalidScore):
        correct_score(
            session, semifinal["id"], 10, 21, expected_version=semifinal["version"]
        )


def test_correction_to_a_tied_score_is_rejected(client, session):
    ids = _generate_bracket(client, 4)
    semifinal = _score(client, ids[(1, 1)], 21, 10)

    with pytest.raises(InvalidScore):
        correct_score(
            session, semifinal["id"], 15, 15, expected_version=semifinal["version"]
        )
    assert _get(client, ids[(1, 1)]) == semifinal


def test_correcting_a_missing_match_raises_not_found(session):
    with pytest.raises(MatchNotFound):
        correct_score(session, 999, 10, 21, expected_version=1)


def test_stale_version_is_rejected_and_nothing_changes(client, session):
    ids = _generate_bracket(client, 4)
    _play_all(client, ids)
    before = {key: _get(client, match_id) for key, match_id in ids.items()}
    semifinal = before[(1, 1)]

    with pytest.raises(VersionConflict):
        correct_score(
            session,
            semifinal["id"],
            team1_score=10,
            team2_score=21,
            expected_version=semifinal["version"] - 1,
        )

    assert {key: _get(client, match_id) for key, match_id in ids.items()} == before
    assert session.exec(select(CorrectionLog)).all() == []
