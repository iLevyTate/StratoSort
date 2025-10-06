#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{database::Database, init::*};
    use sqlx::SqlitePool;
    use tempfile::tempdir;
    use tokio::fs;

    /// Test the fallback vector search when sqlite-vec is not available
    #[tokio::test]
    async fn test_fallback_vector_search() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_fallback.db");

        // Create a database without vector extension
        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                embedding BLOB,
                content TEXT,
                file_type TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        // Insert test embeddings
        let test_embeddings = vec![
            ("/test/file1.txt", vec![0.1, 0.2, 0.3, 0.4]),
            ("/test/file2.txt", vec![0.2, 0.3, 0.4, 0.5]),
            ("/test/file3.txt", vec![0.9, 0.8, 0.7, 0.6]),
        ];

        for (path, embedding) in test_embeddings {
            let embedding_bytes = VectorExtension::f32_vec_to_bytes(&embedding);
            sqlx::query("INSERT OR REPLACE INTO file_analysis (path, embedding) VALUES (?, ?)")
                .bind(path)
                .bind(embedding_bytes)
                .execute(&pool)
                .await
                .expect("Failed to insert test embedding");
        }

        // Test query embedding
        let query_embedding = vec![0.15, 0.25, 0.35, 0.45];

        // Perform fallback search
        let results = ManualVectorSearch::cosine_similarity_search(&pool, &query_embedding, 10)
            .await
            .expect("Fallback search should work");

        // Verify results
        assert_eq!(results.len(), 3);

        // Results should be sorted by similarity (descending)
        assert!(results[0].1 >= results[1].1);
        assert!(results[1].1 >= results[2].1);

        // The most similar should be file2.txt (closest to query)
        assert_eq!(results[0].0, "/test/file2.txt");

        // Verify cosine similarity calculation is correct
        let expected_similarity_1 = cosine_similarity_manual(&query_embedding, &vec![0.1, 0.2, 0.3, 0.4]);
        let expected_similarity_2 = cosine_similarity_manual(&query_embedding, &vec![0.2, 0.3, 0.4, 0.5]);
        let expected_similarity_3 = cosine_similarity_manual(&query_embedding, &vec![0.9, 0.8, 0.7, 0.6]);

        // Results should match manual calculation
        let returned_similarities: Vec<f32> = results.iter().map(|(_, sim)| *sim).collect();
        let expected_similarities = vec![expected_similarity_2, expected_similarity_1, expected_similarity_3];

        // Allow for small floating point differences
        for (returned, expected) in returned_similarities.iter().zip(expected_similarities.iter()) {
            assert!((returned - expected).abs() < 0.001);
        }
    }

    /// Test fallback search with empty results
    #[tokio::test]
    async fn test_fallback_search_empty_results() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_empty.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                embedding BLOB,
                content TEXT,
                file_type TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        let query_embedding = vec![0.1, 0.2, 0.3, 0.4];

        let results = ManualVectorSearch::cosine_similarity_search(&pool, &query_embedding, 10)
            .await
            .expect("Empty search should work");

        assert_eq!(results.len(), 0);
    }

    /// Test fallback search with limit
    #[tokio::test]
    async fn test_fallback_search_with_limit() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_limit.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                embedding BLOB,
                content TEXT,
                file_type TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        // Insert 5 test embeddings
        for i in 0..5 {
            let embedding = vec![i as f32 * 0.1, (i as f32 + 1.0) * 0.1, (i as f32 + 2.0) * 0.1, (i as f32 + 3.0) * 0.1];
            let path = format!("/test/file{}.txt", i);
            let embedding_bytes = VectorExtension::f32_vec_to_bytes(&embedding);
            sqlx::query("INSERT OR REPLACE INTO file_analysis (path, embedding) VALUES (?, ?)")
                .bind(path)
                .bind(embedding_bytes)
                .execute(&pool)
                .await
                .expect("Failed to insert test embedding");
        }

        let query_embedding = vec![0.0, 0.1, 0.2, 0.3];

        // Request only 3 results
        let results = ManualVectorSearch::cosine_similarity_search(&pool, &query_embedding, 3)
            .await
            .expect("Limited search should work");

        assert_eq!(results.len(), 3);
    }

    /// Test cosine similarity calculation directly
    #[test]
    fn test_cosine_similarity_calculation() {
        // Identical vectors should have similarity 1.0
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = ManualVectorSearch::cosine_similarity(&a, &b);
        assert!((similarity - 1.0).abs() < 0.001);

        // Orthogonal vectors should have similarity 0.0
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let similarity = ManualVectorSearch::cosine_similarity(&a, &b);
        assert!((similarity - 0.0).abs() < 0.001);

        // Test with zero vector
        let a = vec![0.0, 0.0, 0.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = ManualVectorSearch::cosine_similarity(&a, &b);
        assert!((similarity - 0.0).abs() < 0.001);

        // Test dimension mismatch (should return 0.0)
        let a = vec![1.0, 2.0];
        let b = vec![1.0, 2.0, 3.0];
        let similarity = ManualVectorSearch::cosine_similarity(&a, &b);
        assert_eq!(similarity, 0.0);
    }

    /// Test vector conversion functions
    #[test]
    fn test_vector_conversion() {
        let original = vec![1.0, 2.0, 3.0, 4.0];
        let bytes = VectorExtension::f32_vec_to_bytes(&original);
        let converted = VectorExtension::bytes_to_f32_vec(&bytes).expect("Conversion should succeed");

        assert_eq!(original.len(), converted.len());
        for (orig, conv) in original.iter().zip(converted.iter()) {
            assert!((orig - conv).abs() < 0.001);
        }
    }

    /// Test vector conversion with invalid bytes
    #[test]
    fn test_vector_conversion_invalid() {
        let invalid_bytes = vec![1, 2, 3]; // Not divisible by 4
        let result = VectorExtension::bytes_to_f32_vec(&invalid_bytes);
        assert!(result.is_err());
    }

    /// Manual cosine similarity calculation for verification
    fn cosine_similarity_manual(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
            return 0.0;
        }

        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

        if magnitude_a == 0.0 || magnitude_b == 0.0 {
            return 0.0;
        }

        dot_product / (magnitude_a * magnitude_b)
    }

    /// Test fallback search performance with many embeddings
    #[tokio::test]
    async fn test_fallback_search_performance() {
        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_performance.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                embedding BLOB,
                content TEXT,
                file_type TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        // Insert 100 test embeddings
        for i in 0..100 {
            let embedding: Vec<f32> = (0..768).map(|j| (i * j) as f32 / 1000.0).collect();
            let path = format!("/test/file{}.txt", i);
            let embedding_bytes = VectorExtension::f32_vec_to_bytes(&embedding);
            sqlx::query("INSERT OR REPLACE INTO file_analysis (path, embedding) VALUES (?, ?)")
                .bind(path)
                .bind(embedding_bytes)
                .execute(&pool)
                .await
                .expect("Failed to insert test embedding");
        }

        let query_embedding: Vec<f32> = (0..768).map(|j| j as f32 / 1000.0).collect();

        // Time the search
        let start = std::time::Instant::now();
        let results = ManualVectorSearch::cosine_similarity_search(&pool, &query_embedding, 10)
            .await
            .expect("Performance test search should work");
        let duration = start.elapsed();

        // Should complete in reasonable time (less than 5 seconds for 100 embeddings)
        assert!(duration.as_secs() < 5, "Search took too long: {:?}", duration);

        assert_eq!(results.len(), 10);
        // Results should be sorted by similarity
        for i in 1..results.len() {
            assert!(results[i-1].1 >= results[i].1);
        }
    }

    /// Integration test comparing vector extension vs fallback results
    #[tokio::test]
    async fn test_vector_vs_fallback_consistency() {
        // This test would require both sqlite-vec and fallback to be available
        // For now, just test that fallback works correctly in isolation

        let temp_dir = tempdir().expect("Failed to create temp directory");
        let db_path = temp_dir.path().join("test_consistency.db");

        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", db_path.display()))
            .await
            .expect("Failed to create test database");

        // Initialize basic schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_analysis (
                path TEXT PRIMARY KEY,
                embedding BLOB,
                content TEXT,
                file_type TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create test table");

        // Insert test data
        let test_data = vec![
            ("/docs/manual.pdf", vec![0.1, 0.2, 0.3]),
            ("/docs/guide.pdf", vec![0.15, 0.25, 0.35]),
            ("/images/photo.jpg", vec![0.8, 0.7, 0.6]),
        ];

        for (path, embedding) in test_data {
            let embedding_bytes = VectorExtension::f32_vec_to_bytes(&embedding);
            sqlx::query("INSERT OR REPLACE INTO file_analysis (path, embedding) VALUES (?, ?)")
                .bind(path)
                .bind(embedding_bytes)
                .execute(&pool)
                .await
                .expect("Failed to insert test data");
        }

        let query_embedding = vec![0.12, 0.22, 0.32];

        // Test fallback search
        let fallback_results = ManualVectorSearch::cosine_similarity_search(&pool, &query_embedding, 10)
            .await
            .expect("Fallback search should work");

        assert_eq!(fallback_results.len(), 3);

        // Manual calculation for verification
        let manual_results: Vec<_> = test_data.iter()
            .map(|(path, embedding)| {
                let similarity = cosine_similarity_manual(&query_embedding, embedding);
                (path.to_string(), similarity)
            })
            .collect();

        // Sort manual results
        let mut manual_results = manual_results;
        manual_results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        // Results should match (within floating point precision)
        for ((fallback_path, fallback_sim), (manual_path, manual_sim)) in
            fallback_results.iter().zip(manual_results.iter()) {
            assert_eq!(fallback_path, manual_path);
            assert!((fallback_sim - manual_sim).abs() < 0.001);
        }
    }
}
