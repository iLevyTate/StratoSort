# Contributing to StratoSort

Thank you for considering a contribution to StratoSort! This project welcomes pull requests and issues from the community. The following guidelines outline the basic workflow and coding standards used across the repository.

## Workflow

1. **Fork** the repository to your own GitHub account.
2. **Create a branch** for your work:
   ```bash
   git checkout -b feature/my-change
   ```
3. **Install dependencies** and run the development environment:
   ```bash
   npm install
   npm run dev
   ```
4. **Lint and test** your changes before committing:
   ```bash
   npm run lint
   npm test
   ```
5. **Commit** with a clear message describing the change.
6. **Push** your branch and open a pull request against `main`.

## Coding Standards

- This project uses **Prettier** for code formatting. Run `npm run lint` to automatically format and check your code.
- Follow the rules defined in `.eslintrc.js`. Common guidelines include using single quotes, two spaces for indentation, and avoiding unused variables.
- Keep line length under 100 characters when possible.
- Include unit or integration tests for new features when applicable.

By following these steps, you help keep StratoSort consistent and maintainable. We appreciate your contributions!
