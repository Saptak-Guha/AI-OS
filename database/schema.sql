-- AetherOS Production Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  role VARCHAR(30) DEFAULT 'user',
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  objective TEXT NOT NULL,
  task_type VARCHAR(100) DEFAULT 'general',
  status VARCHAR(50) DEFAULT 'pending',
  progress INT DEFAULT 0,
  workflow_id INT,
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_status VARCHAR(50),
  plan JSONB DEFAULT '[]',
  output TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  role VARCHAR(100) NOT NULL,
  goal TEXT NOT NULL,
  backstory TEXT,
  tools JSONB DEFAULT '[]',
  specialization VARCHAR(100),
  performance_score FLOAT DEFAULT 0.0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  agent_name VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  task_id INT REFERENCES tasks(id) ON DELETE SET NULL,
  agent_name VARCHAR(100),
  memory_type VARCHAR(50) NOT NULL DEFAULT 'long_term',
  content TEXT NOT NULL,
  tags VARCHAR(500) DEFAULT '',
  priority VARCHAR(30) DEFAULT 'normal',
  embedding_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  task_id INT REFERENCES tasks(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  storage_path TEXT,
  summary TEXT,
  insights JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'uploaded',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  message TEXT,
  reasoning TEXT,
  tool_used VARCHAR(100),
  tool_input JSONB,
  tool_output JSONB,
  progress INT DEFAULT 0,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  node_type VARCHAR(100) DEFAULT 'concept',
  content TEXT,
  source_type VARCHAR(100),
  source_id INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  source_node_id INT REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id INT REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relationship VARCHAR(200) NOT NULL,
  weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INT,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'New Session',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_type ON memories(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_logs_task ON agent_logs(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_user ON knowledge_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, created_at DESC);

-- Seed default agents
INSERT INTO agents (name, role, goal, backstory, tools, specialization) VALUES
  ('manager', 'Manager Agent', 'Orchestrate the entire AI workforce and ensure task completion.', 'Executive coordinator of autonomous AI teams.', '["workflow_control"]', 'orchestration'),
  ('planner', 'Planner Agent', 'Break down high-level objectives into executable subtasks with dependencies.', 'Strategic systems thinker for autonomous planning.', '["calculator"]', 'planning'),
  ('research', 'Research Agent', 'Collect, validate, and synthesize information from multiple sources.', 'Expert research analyst with source validation skills.', '["web_search", "document_parser", "api_connector"]', 'research'),
  ('writer', 'Writer Agent', 'Create high-quality content, code, and deliverables.', 'Professional content and technical writer.', '["document_parser"]', 'content'),
  ('reviewer', 'Reviewer Agent', 'Review outputs for quality, clarity, and completeness.', 'Senior editor and quality strategist.', '[]', 'review'),
  ('qa', 'QA Agent', 'Verify factual consistency, accuracy, and compliance.', 'Quality assurance specialist with attention to detail.', '["calculator", "code_interpreter"]', 'quality'),
  ('memory', 'Memory Agent', 'Capture, organize, and retrieve contextual knowledge.', 'Long-term memory keeper for the AI workforce.', '["database_query"]', 'memory'),
  ('tool', 'Tool Agent', 'Execute specialized tools and integrations on demand.', 'Technical operations specialist.', '["web_search", "pdf_reader", "csv_analyzer", "code_interpreter", "image_analyzer"]', 'tools'),
  ('delivery', 'Delivery Agent', 'Format and package final outputs for delivery.', 'Production delivery specialist.', '["document_parser"]', 'delivery'),
  ('strategy', 'Strategy Agent', 'Develop business strategies, GTM plans, and market analysis.', 'Business strategy consultant.', '["web_search", "csv_analyzer"]', 'strategy'),
  ('architect', 'Software Architect Agent', 'Design system architecture, APIs, and database schemas.', 'Senior software architect.', '["code_interpreter"]', 'architecture')
ON CONFLICT (name) DO NOTHING;
