/**
 * Agent Fullstack - Fullstack Development Agent
 *
 * Provides fullstack development capabilities.
 *
 * Usage: node agent-fullstack.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   stacks     - List tech stacks
 *   analyze    - Analyze fullstack project
 */

class FullstackProject {
  constructor(config) {
    this.id = `fs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.frontend = config.frontend;
    this.backend = config.backend;
    this.database = config.database;
    this.deployment = config.deployment;
  }
}

class Module {
  constructor(config) {
    this.id = `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.layer = config.layer; // ui, api, db
    this.technology = config.technology;
  }
}

class TechStack {
  constructor(config) {
    this.id = `stack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.frontend = config.frontend;
    this.backend = config.backend;
    this.database = config.database;
  }
}

class FullstackAgent {
  constructor(config = {}) {
    this.name = config.name || 'FullstackAgent';
    this.version = config.version || '1.0';
    this.projects = new Map();
    this.modules = new Map();
    this.stacks = new Map();
    this.stats = {
      projectsCreated: 0,
      modulesBuilt: 0,
      deploymentsConfigured: 0
    };
    this.initStacks();
  }

  initStacks() {
    const stacks = [
      new TechStack({
        name: 'MERN',
        frontend: 'React',
        backend: 'Node.js/Express',
        database: 'MongoDB'
      }),
      new TechStack({
        name: 'MEAN',
        frontend: 'Angular',
        backend: 'Node.js/Express',
        database: 'MongoDB'
      }),
      new TechStack({
        name: 'JAMstack',
        frontend: 'Next.js/Gatsby',
        backend: 'Serverless',
        database: 'PostgreSQL'
      }),
      new TechStack({
        name: 'T3 Stack',
        frontend: 'Next.js',
        backend: 'tRPC/Serverless',
        database: 'PostgreSQL/Prisma'
      }),
      new TechStack({
        name: 'Django',
        frontend: 'React/Vue',
        backend: 'Django/Python',
        database: 'PostgreSQL'
      }),
      new TechStack({
        name: 'Rails',
        frontend: 'React/Hotwire',
        backend: 'Ruby on Rails',
        database: 'PostgreSQL'
      })
    ];
    stacks.forEach(s => this.stacks.set(s.name, s));
  }

  createProject(name, frontend, backend, database, deployment) {
    const project = new FullstackProject({ name, frontend, backend, database, deployment });
    this.projects.set(project.id, project);
    this.stats.projectsCreated++;
    return project;
  }

  addModule(name, layer, technology) {
    const module = new Module({ name, layer, technology });
    this.modules.set(module.id, module);
    this.stats.modulesBuilt++;
    return module;
  }

  analyzeProject(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const checks = [];

    if (!project.frontend) {
      checks.push({ status: 'fail', message: 'Frontend is required' });
    }
    if (!project.backend) {
      checks.push({ status: 'fail', message: 'Backend is required' });
    }
    if (!project.database) {
      checks.push({ status: 'warn', message: 'No database specified' });
    }

    return {
      project: project.name,
      frontend: project.frontend,
      backend: project.backend,
      database: project.database,
      deployment: project.deployment,
      checks,
      score: Math.max(0, 100 - (checks.filter(c => c.status === 'fail').length * 30))
    };
  }

  listStacks() {
    return Array.from(this.stacks.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const fs = new FullstackAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Fullstack Demo\n');

    // 1. Fullstack Project
    console.log('1. Create Fullstack Project:');
    const project = fs.createProject('MySaaSApp', 'Next.js', 'Node.js/Express', 'PostgreSQL', 'Vercel/AWS');
    console.log(`   Project: ${project.name}`);
    console.log(`   Frontend: ${project.frontend}`);
    console.log(`   Backend: ${project.backend}`);
    console.log(`   Database: ${project.database}`);
    console.log(`   Deployment: ${project.deployment}`);

    // 2. Modules
    console.log('\n2. Build Modules:');
    const mod1 = fs.addModule('Auth Module', 'api', 'JWT/Passport');
    console.log(`   Module: ${mod1.name}`);
    console.log(`   Layer: ${mod1.layer}`);
    console.log(`   Technology: ${mod1.technology}`);

    const mod2 = fs.addModule('Dashboard UI', 'ui', 'React/Chart.js');
    console.log(`   Module: ${mod2.name}`);

    const mod3 = fs.addModule('User Data', 'db', 'Prisma/PostgreSQL');
    console.log(`   Module: ${mod3.name}`);

    // 3. Tech Stacks
    console.log('\n3. Popular Tech Stacks:');
    const stacks = fs.listStacks();
    console.log(`   Total: ${stacks.length} stacks`);
    stacks.forEach(s => {
      console.log(`   - ${s.name}: ${s.frontend} + ${s.backend} + ${s.database}`);
    });

    // 4. Project Analysis
    console.log('\n4. Project Analysis:');
    const analysis = fs.analyzeProject(project.id);
    console.log(`   Project: ${analysis.project}`);
    console.log(`   Frontend: ${analysis.frontend}`);
    console.log(`   Backend: ${analysis.backend}`);
    console.log(`   Database: ${analysis.database}`);
    analysis.checks.forEach(c => {
      console.log(`   [${c.status.toUpperCase()}] ${c.message}`);
    });
    console.log(`   Score: ${analysis.score}%`);

    // 5. Architecture Patterns
    console.log('\n5. Architecture Patterns:');
    console.log(`   Monolithic: Simple, all in one deploy`);
    console.log(`   Microservices: Independent services, complex`);
    console.log(`   Serverless: Functions, auto-scale, pay-per-use`);
    console.log(`   Modular Monolith: Clean modules, single deploy`);

    // 6. API Integration
    console.log('\n6. Frontend-Backend Integration:');
    console.log(`   REST: Standard, widely understood`);
    console.log(`   GraphQL: Flexible queries, reduce over-fetching`);
    console.log(`   tRPC: End-to-end type safety, DX focused`);
    console.log(`   WebSocket: Real-time, bidirectional`);

    // 7. DevOps
    console.log('\n7. DevOps Pipeline:');
    console.log(`   CI: GitHub Actions, GitLab CI, Jenkins`);
    console.log(`   Container: Docker, Docker Compose`);
    console.log(`   Orchestration: Kubernetes, Docker Swarm`);
    console.log(`   Cloud: AWS, GCP, Azure, Vercel`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = fs.getStats();
    console.log(`   Projects created: ${stats.projectsCreated}`);
    console.log(`   Modules built: ${stats.modulesBuilt}`);
    console.log(`   Deployments configured: ${stats.deploymentsConfigured}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'stacks': {
    console.log('Popular Tech Stacks:');
    const stacks = fs.listStacks();
    stacks.forEach(s => {
      console.log(`  ${s.name}: ${s.frontend} + ${s.backend} + ${s.database}`);
    });
    break;
  }

  case 'analyze': {
    const proj = fs.createProject('demo', 'Vue', 'Django', 'SQLite', 'Railway');
    const result = fs.analyzeProject(proj.id);
    console.log(`Analysis: ${result.score}%`);
    result.checks.forEach(c => console.log(`  [${c.status}] ${c.message}`));
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-fullstack.js [demo|stacks|analyze]');
  }
}
