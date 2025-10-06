use crate::{
    ai::{LearnedPattern, OrganizationPrediction},
    error::Result,
    state::AppState,
};
use std::sync::Arc;
use tauri::State;

/// Get learned patterns from user behavior
#[tauri::command]
pub async fn get_learned_patterns(state: State<'_, Arc<AppState>>) -> Result<Vec<LearnedPattern>> {
    // Get file watcher for recent actions
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(std::sync::Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        // Use the behavioral learning system to detect patterns
        let _actions = watcher.get_recent_user_actions(1000).await;

        // For now, return empty - this needs proper integration with BehavioralLearning
        Ok(vec![])
    } else {
        Ok(vec![])
    }
}

/// Predict organization for a file based on learned patterns
#[tauri::command]
pub async fn predict_organization_with_patterns(
    _file_path: String,
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
) -> Result<Option<OrganizationPrediction>> {
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(std::sync::Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        // Get recent user actions for pattern analysis
        let _actions = watcher.get_recent_user_actions(1000).await;

        // For now, return None - this needs proper integration
        Ok(None)
    } else {
        Ok(None)
    }
}

/// Get smart folder suggestions based on learned patterns
#[tauri::command]
pub async fn get_smart_folder_suggestions_from_patterns(
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>> {
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(std::sync::Arc::clone)
    };

    if let Some(_watcher) = watcher_arc {
        // For now, return empty - this needs proper integration
        Ok(vec![])
    } else {
        Ok(vec![])
    }
}

/// Clear learned patterns (reset behavioral learning)
#[tauri::command]
pub async fn clear_learned_patterns(
    state: State<'_, Arc<AppState>>,
    _app: tauri::AppHandle,
) -> Result<()> {
    // Clear recent actions (this would need to be implemented in FileWatcher)
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(std::sync::Arc::clone)
    };

    if let Some(_watcher) = watcher_arc {
        // Implementation needed
    }

    Ok(())
}

/// Get pattern statistics
#[tauri::command]
pub async fn get_pattern_statistics(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value> {
    let watcher_arc = {
        let watcher_guard = state.file_watcher.read();
        watcher_guard.as_ref().map(std::sync::Arc::clone)
    };

    if let Some(watcher) = watcher_arc {
        let actions_count = watcher.get_recent_user_actions(10000).await.len();

        Ok(serde_json::json!({
            "total_actions": actions_count,
            "patterns_detected": 0, // Would need proper implementation
            "confidence_threshold": 0.8
        }))
    } else {
        Ok(serde_json::json!({
            "total_actions": 0,
            "patterns_detected": 0,
            "confidence_threshold": 0.8
        }))
    }
}
