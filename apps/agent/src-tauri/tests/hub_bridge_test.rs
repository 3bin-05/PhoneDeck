use agent_lib::hub::AgentHub;
use protocol::AgentEventKind;
use std::sync::Arc;

#[tokio::test]
async fn test_hub_dispatch_and_git_enrichment() {
    let hub = Arc::new(AgentHub::new());
    let mut rx = hub.event_tx.subscribe();

    let cwd = std::env::current_dir().unwrap().to_string_lossy().to_string();

    let event = protocol::AgentEvent {
        id: "test-event-1".to_string(),
        ts: 1000,
        agent: "claude-code".to_string(),
        project: "phone-deck".to_string(),
        cwd: cwd.clone(),
        kind: AgentEventKind::Done,
        title: "Task Finished".to_string(),
        summary: "Awaiting review".to_string(),
        stats: None,
        actions: vec!["open_editor".to_string()],
        expires_at: None,
    };

    hub.dispatch_event(event).await;

    // Receive broadcast event
    let received = tokio::time::timeout(std::time::Duration::from_secs(3), rx.recv())
        .await
        .expect("Timeout waiting for event broadcast")
        .expect("Failed to receive event");

    assert_eq!(received.agent, "claude-code");
    assert_eq!(received.kind, AgentEventKind::Done);
    // Git stats should be populated
    assert!(received.stats.is_some(), "Git stats should be enriched on done event");
    println!("Enriched summary: {}", received.summary);
}

#[tokio::test]
async fn test_ask_approval_flow() {
    let hub = Arc::new(AgentHub::new());
    let hub_clone = hub.clone();

    let ask_handle = tokio::spawn(async move {
        hub_clone
            .ask_approval(
                "Run unit test suite?".to_string(),
                Some("cargo test".to_string()),
                None,
                5,
            )
            .await
    });

    // Wait for approval to register
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // Find the pending approval ID
    let pending_id = {
        let map = hub.pending_approvals.read().await;
        map.keys().next().cloned()
    };

    assert!(pending_id.is_some(), "Approval should be registered in pending map");
    let id = pending_id.unwrap();

    // Resolve approval as true
    let resolved = hub.resolve_approval(&id, true).await;
    assert!(resolved, "Should resolve active approval ID");

    // Await ask handle
    let result = ask_handle.await.unwrap();
    assert_eq!(result, Ok(true), "Approval should return Ok(true)");
}

#[tokio::test]
async fn test_event_deduplication() {
    let hub = Arc::new(AgentHub::new());
    let mut rx = hub.event_tx.subscribe();

    let event1 = protocol::AgentEvent {
        id: "dedupe-1".to_string(),
        ts: 1000,
        agent: "claude-code".to_string(),
        project: "phone-deck".to_string(),
        cwd: ".".to_string(),
        kind: AgentEventKind::Working,
        title: "Working on task".to_string(),
        summary: "Refactoring".to_string(),
        stats: None,
        actions: vec![],
        expires_at: None,
    };

    let event2 = event1.clone();

    hub.dispatch_event(event1).await;
    hub.dispatch_event(event2).await; // Should be coalesced / dropped

    let first = rx.try_recv();
    assert!(first.is_ok(), "First event should be received");

    let second = rx.try_recv();
    assert!(second.is_err(), "Duplicate event within 2s should be dropped");
}
