-- Add naming conventions table
CREATE TABLE IF NOT EXISTS naming_conventions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,
    data TEXT NOT NULL,  -- Full JSON of NamingConvention
    created_at INTEGER NOT NULL,
    updated_at INTEGER DEFAULT NULL
);

-- Add smart folder metadata for user guidance
CREATE TABLE IF NOT EXISTS smart_folder_metadata (
    folder_id TEXT PRIMARY KEY,
    ai_guidance TEXT,  -- User's description of what belongs in this folder
    naming_convention_id TEXT,  -- Reference to naming_conventions.id
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (folder_id) REFERENCES smart_folders(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_naming_conventions_name ON naming_conventions(name);
CREATE INDEX IF NOT EXISTS idx_smart_folder_metadata_folder ON smart_folder_metadata(folder_id);

-- Protected folders management
CREATE TABLE IF NOT EXISTS protected_folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER DEFAULT NULL
);

-- Index for faster protected folder lookups
CREATE INDEX IF NOT EXISTS idx_protected_folders_path ON protected_folders(path);

-- File duplicate tracking
CREATE TABLE IF NOT EXISTS file_duplicates (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(hash, size)
);

CREATE TABLE IF NOT EXISTS duplicate_groups (
    id TEXT PRIMARY KEY,
    master_file_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (master_file_id) REFERENCES file_duplicates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS duplicate_group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES file_duplicates(id) ON DELETE CASCADE,
    UNIQUE(group_id, file_id)
);

-- Indexes for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_file_duplicates_hash ON file_duplicates(hash);
CREATE INDEX IF NOT EXISTS idx_file_duplicates_size ON file_duplicates(size);
CREATE INDEX IF NOT EXISTS idx_duplicate_groups_master ON duplicate_groups(master_file_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_group_members_group ON duplicate_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_group_members_file ON duplicate_group_members(file_id);

-- Quarantine management for recently moved files
CREATE TABLE IF NOT EXISTS quarantined_files (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    original_path TEXT NOT NULL,
    reason TEXT,
    quarantine_until INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(file_path)
);

-- Index for faster quarantine lookups
CREATE INDEX IF NOT EXISTS idx_quarantined_files_until ON quarantined_files(quarantine_until);
CREATE INDEX IF NOT EXISTS idx_quarantined_files_path ON quarantined_files(file_path);


