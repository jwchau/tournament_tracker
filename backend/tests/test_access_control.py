"""Spectators can read everything; only signed-in users can change anything.

These walk every route the app has, so a new route is covered as soon as it
exists and can't forget the sign-in check.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Signing in is the one write a signed-out user has to be able to make.
PUBLIC_WRITES = {("POST", "/auth/login")}
# Says who is signed in, so a spectator gets 401 there (tested with the auth API).
PRIVATE_READS = {("GET", "/auth/me")}


def _routes(methods):
    # The OpenAPI schema lists every API route with its full path, including
    # those from included routers (which `app.routes` no longer flattens).
    paths = create_app().openapi()["paths"]
    return sorted(
        (method.upper(), path)
        for path, operations in paths.items()
        for method in operations
        if method.upper() in methods
    )


def _url(path):
    return re.sub(r"\{[^}]+\}", "1", path)


WRITE_ROUTES = [route for route in _routes(WRITE_METHODS) if route not in PUBLIC_WRITES]
READ_ROUTES = [route for route in _routes({"GET"}) if route not in PRIVATE_READS]


def test_the_route_walk_finds_the_app_routes():
    assert ("PATCH", "/matches/{match_id}/score") in WRITE_ROUTES
    assert ("GET", "/tournaments") in READ_ROUTES
    assert ("GET", "/health") in READ_ROUTES


@pytest.mark.parametrize(("method", "path"), WRITE_ROUTES, ids=" ".join)
def test_every_write_route_refuses_signed_out_requests(anonymous_client, method, path):
    assert anonymous_client.request(method, _url(path)).status_code == 401


@pytest.mark.parametrize(("method", "path"), READ_ROUTES, ids=" ".join)
def test_every_read_route_stays_public(anonymous_client, method, path):
    # There's no data, so most answer 404; the point is they don't ask for a session.
    assert anonymous_client.request(method, _url(path)).status_code not in (401, 403)


def test_signed_out_users_can_read_what_signed_in_users_wrote(client, anonymous_client):
    tournament = client.post("/tournaments", json={"name": "Spring Classic"}).json()

    assert anonymous_client.get(f"/tournaments/{tournament['id']}").json()["name"] == "Spring Classic"


def test_cors_lets_the_frontend_send_the_session_cookie(anonymous_client):
    response = anonymous_client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_still_allows_quick_tunnels(anonymous_client):
    origin = "https://some-words-here.trycloudflare.com"

    response = anonymous_client.get("/health", headers={"Origin": origin})

    assert response.headers["access-control-allow-origin"] == origin


def test_cors_allows_only_the_frontend_origin_when_it_is_set(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://tournament.example.org")
    client = TestClient(create_app())

    def allowed(origin):
        response = client.get("/health", headers={"Origin": origin})
        return response.headers.get("access-control-allow-origin") == origin

    assert allowed("https://tournament.example.org")
    assert client.get(
        "/health", headers={"Origin": "https://tournament.example.org"}
    ).headers["access-control-allow-credentials"] == "true"
    assert not allowed("http://localhost:5173")
    assert not allowed("https://some-words-here.trycloudflare.com")