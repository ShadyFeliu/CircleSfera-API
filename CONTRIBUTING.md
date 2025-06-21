# Contributing to CircleSfera

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18.0.0
- npm or pnpm
- Git

### Setup Development Environment

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YourUsername/CircleSfera-Backend.git
   cd CircleSfera-Backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create .env file:
   ```bash
   cp .env.example .env
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## 🧪 Testing

We use Jest for testing. The project includes several types of tests:

- Unit tests: `npm test`
- Integration tests: `npm run test:integration`
- All tests with coverage: `npm run test:all`

### Writing Tests

- Place unit tests in `__tests__` directory
- Place integration tests in `__tests__/integration`
- Follow the existing test patterns
- Maintain 80% or higher coverage

### Running Tests

```bash
# Run all tests
npm run test:all

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📝 Code Style

We use ESLint and Prettier for code consistency:

```bash
# Lint check
npm run lint

# Fix linting issues
npm run lint:fix
```

### Pre-commit Hooks

The project uses Husky and lint-staged to ensure code quality:
- ESLint runs on staged .ts files
- Prettier formats staged files
- Tests must pass before commit

## 🏗️ Project Structure

```
├── src/
│   ├── server.ts           # Main server entry
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── services/          # Business logic services
├── __tests__/
│   ├── integration/       # Integration tests
│   └── unit/             # Unit tests
└── config/               # Configuration files
```

## 🔄 Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes following our code style
3. Write/update tests
4. Run full test suite
5. Commit using conventional commits:
   ```bash
   git commit -m "feat: add new feature"
   ```

### Commit Message Format

We follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `test:` Test updates
- `chore:` Maintenance tasks

## 🐛 Reporting Issues

- Use the issue templates
- Include steps to reproduce
- Include expected vs actual behavior
- Include relevant logs/screenshots

## 🚀 Pull Request Process

1. Update documentation for new features
2. Update/add tests
3. Ensure CI passes
4. Request review from maintainers
5. Address review feedback

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CI passes
- [ ] Code formatted
- [ ] Conventional commit messages used

## 📚 Additional Resources

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

## 🤝 Code of Conduct

Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## ❓ Questions?

Feel free to open an issue for any questions about contributing.

Thank you for contributing to CircleSfera! 🚀
