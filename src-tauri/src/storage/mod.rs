pub mod database;
pub mod init;
pub mod vector_ext;

pub use database::{Database, Operation, CURRENT_SCHEMA_VERSION};
pub use init::{
    check_vec_extension_availability, get_vector_config_for_model, initialize_sqlite_vec,
    VectorConfig,
};
pub use vector_ext::{ManualVectorSearch, VectorExtension, VectorStats};
