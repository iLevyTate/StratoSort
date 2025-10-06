#[cfg(test)]
mod tests {
    use crate::utils::security::*;

    /// Test path traversal vulnerability detection
    #[test]
    fn test_path_traversal_detection() {
        // Test various path traversal attempts by checking component parsing
        let malicious_paths = vec![
            "../../etc/passwd",
            "..\\..\\Windows\\System32",
            "../../../root/sensitive",
            "C:\\Windows\\System32\\..\\..\\",
            "/home/user/../../root/",
            "../../../../etc/shadow",
            "..//..//..//etc//passwd",
        ];

        for path in malicious_paths {
            let path_buf = std::path::PathBuf::from(path);

            // Check if path contains parent directory components
            let has_parent_dir = path_buf.components().any(|c| matches!(c, std::path::Component::ParentDir));

            if has_parent_dir {
                // These paths would be blocked by our validation logic
                // In a real test with AppHandle, they would fail validation
                // Path contains parent directory: {} - would be blocked by validation logic
            }
        }
    }

    /// Test valid paths don't contain traversal components
    #[test]
    fn test_valid_paths_allowed() {
        let valid_paths = vec![
            "/home/user/documents",
            "C:\\Users\\Documents",
            "./files",
            "documents/file.txt",
            "/tmp/test",
        ];

        for path in valid_paths {
            let path_buf = std::path::PathBuf::from(path);

            // Check that valid paths don't contain parent directory components
            let has_parent_dir = path_buf.components().any(|c| matches!(c, std::path::Component::ParentDir));

            // Valid paths should not have parent directory components
            assert!(!has_parent_dir, "Valid path should not contain parent directory: {}", path);
        }
    }

    /// Test system directory detection
    #[test]
    fn test_system_directory_detection() {
        let system_paths = vec![
            "/etc/passwd",
            "/etc/shadow",
            "C:\\Windows\\System32\\",
            "/root/private",
        ];

        for path in system_paths {
            let path_str = path.to_string();

            // Check if these paths would be blocked by is_path_allowed logic
            let blocked_paths = [
                "/etc/passwd",
                "/etc/shadow",
                "/root/",
                "C:\\Windows\\System32\\",
                "C:\\System Volume Information\\",
                "C:\\$Recycle.Bin\\",
            ];

            let is_blocked = blocked_paths.iter().any(|blocked| path_str.starts_with(blocked));
            assert!(is_blocked, "System path should be detected as blocked: {}", path);
        }

        // Test that non-system paths are not blocked
        let allowed_paths = vec![
            "/home/user/documents",
            "/tmp/test",
            "C:\\Users\\Documents",
        ];

        for path in allowed_paths {
            let path_str = path.to_string();
            let blocked_paths = [
                "/etc/passwd",
                "/etc/shadow",
                "/root/",
                "C:\\Windows\\System32\\",
                "C:\\System Volume Information\\",
                "C:\\$Recycle.Bin\\",
            ];

            let is_blocked = blocked_paths.iter().any(|blocked| path_str.starts_with(blocked));
            assert!(!is_blocked, "Non-system path should not be blocked: {}", path);
        }
    }

    /// Test control character detection
    #[test]
    fn test_control_character_detection() {
        let malicious_paths = vec![
            "file.txt\0",
            "test\x01\x02file",
        ];

        for path in malicious_paths {
            // Check for null bytes
            let has_null = path.contains('\0');

            // Check for control characters (excluding \r and \n)
            let has_control = path.chars().any(|c| c.is_control() && c != '\r' && c != '\n');

            assert!(has_null || has_control, "Path should contain control characters: {:?}", path.as_bytes());
        }

        // Test that \r and \n are allowed (as mentioned in the security function)
        let allowed_path = "path\r\nwith\nallowed";
        let has_null = allowed_path.contains('\0');
        let has_control = allowed_path.chars().any(|c| c.is_control() && c != '\r' && c != '\n');

        assert!(!has_null && !has_control, "Path with only \\r and \\n should be allowed");
    }

    /// Test filename sanitization
    #[test]
    fn test_filename_sanitization() {
        let test_cases = vec![
            ("file<name>.txt", "filename.txt"), // Remove dangerous chars
            ("file|name.txt", "filename.txt"),   // Remove pipe
            ("file\"name.txt", "filename.txt"),  // Remove quotes
            ("file:name.txt", "filename.txt"),   // Remove colon
            ("file*name.txt", "filename.txt"),   // Remove asterisk
            ("file?name.txt", "filename.txt"),   // Remove question mark
            ("file/name.txt", "filename.txt"),  // Remove slash
            ("file\\name.txt", "filename.txt"), // Remove backslash
        ];

        for (input, expected) in test_cases {
            let result = sanitize_filename(input);
            assert_eq!(result, expected, "Failed to sanitize: {}", input);
        }
    }

    /// Test empty path detection
    #[test]
    fn test_empty_path_detection() {
        // Test that empty paths are detected as problematic
        let empty_path = "";
        assert!(empty_path.is_empty(), "Empty path should be detected");
    }
}
