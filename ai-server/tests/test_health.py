def test_health_reports_models(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    # Surfaces the configured ASR and LLM models.
    assert "asr_model" in body
    assert "llm_model" in body
    assert body["llm_backend"].startswith("http")
