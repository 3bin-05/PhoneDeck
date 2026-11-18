use protocol::GitStats;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

/// Collects git diff statistics for a given working directory with a strict 2s timeout.
/// Per plan.md section 6.4:
/// "When a `done` event arrives, the Agent runs, off the main thread with a 2 s timeout:
///  git diff --shortstat and git status --porcelain in the session's cwd"
pub async fn collect_git_stats(cwd: &str, duration_s: u64) -> Option<GitStats> {
    let cwd_path = std::path::Path::new(cwd);
    if !cwd_path.exists() {
        return None;
    }

    // Run git diff --shortstat with a 1.8s timeout
    let diff_future = async {
        Command::new("git")
            .args(["diff", "--shortstat"])
            .current_dir(cwd_path)
            .output()
            .await
            .ok()
    };

    let status_future = async {
        Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(cwd_path)
            .output()
            .await
            .ok()
    };

    let result = timeout(Duration::from_millis(1800), async {
        tokio::join!(diff_future, status_future)
    })
    .await;

    match result {
        Ok((diff_res, status_res)) => {
            let mut files_changed = 0;
            let mut insertions = 0;
            let mut deletions = 0;

            if let Some(output) = diff_res {
                let stdout = String::from_utf8_lossy(&output.stdout);
                parse_shortstat(&stdout, &mut files_changed, &mut insertions, &mut deletions);
            }

            // If diff was clean but untracked files exist, count them from status --porcelain
            if let Some(output) = status_res {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let untracked_or_modified = stdout
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .count() as u32;

                if files_changed == 0 && untracked_or_modified > 0 {
                    files_changed = untracked_or_modified;
                }
            }

            Some(GitStats {
                duration_s,
                files_changed,
                insertions,
                deletions,
            })
        }
        Err(_) => {
            log::warn!("[GitStats] Timed out waiting for git in {}", cwd);
            None
        }
    }
}

/// Parses " 6 files changed, 142 insertions(+), 38 deletions(-)"
fn parse_shortstat(text: &str, files: &mut u32, ins: &mut u32, del: &mut u32) {
    let parts: Vec<&str> = text.split(',').collect();
    for part in parts {
        let trimmed = part.trim();
        if trimmed.contains("file") {
            if let Some(num_str) = trimmed.split_whitespace().next() {
                if let Ok(n) = num_str.parse::<u32>() {
                    *files = n;
                }
            }
        } else if trimmed.contains("insertion") {
            if let Some(num_str) = trimmed.split_whitespace().next() {
                if let Ok(n) = num_str.parse::<u32>() {
                    *ins = n;
                }
            }
        } else if trimmed.contains("deletion") {
            if let Some(num_str) = trimmed.split_whitespace().next() {
                if let Ok(n) = num_str.parse::<u32>() {
                    *del = n;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_shortstat() {
        let sample = " 6 files changed, 142 insertions(+), 38 deletions(-)\n";
        let mut files = 0;
        let mut ins = 0;
        let mut del = 0;
        parse_shortstat(sample, &mut files, &mut ins, &mut del);
        assert_eq!(files, 6);
        assert_eq!(ins, 142);
        assert_eq!(del, 38);
    }

    #[test]
    fn test_parse_insertions_only() {
        let sample = " 1 file changed, 25 insertions(+)\n";
        let mut files = 0;
        let mut ins = 0;
        let mut del = 0;
        parse_shortstat(sample, &mut files, &mut ins, &mut del);
        assert_eq!(files, 1);
        assert_eq!(ins, 25);
        assert_eq!(del, 0);
    }
}
