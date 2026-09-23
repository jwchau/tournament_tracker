def create_tournament(client, name="Test Cup"):
    """A new tournament with its settings confirmed, ready for teams, pools, and brackets."""
    tournament = client.post("/tournaments", json={"name": name}).json()
    return client.post(f"/tournaments/{tournament['id']}/confirm-settings").json()
