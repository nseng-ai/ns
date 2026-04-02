.PHONY: lint format-check fix ty test fast-ci clean

lint:
	uv run ruff check

format-check:
	uv run ruff format --check

fix:
	uv run ruff check --fix --unsafe-fixes
	uv run ruff format

ty:
	uv run ty check

test:
	uv run pytest -n auto

fast-ci:
	@echo "=== Fast CI ===" && \
	exit_code=0; \
	echo "\n--- Lint ---" && uv run ruff check || exit_code=1; \
	echo "\n--- Format Check ---" && uv run ruff format --check || exit_code=1; \
	echo "\n--- ty ---" && uv run ty check || exit_code=1; \
	echo "\n--- Tests ---" && uv run pytest -n auto || exit_code=1; \
	exit $$exit_code

clean:
	rm -rf dist/*.whl dist/*.tar.gz
	find . -type d -name "__pycache__" -exec rm -rf {} + || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + || true
	find . -type f -name "*.pyc" -delete || true
