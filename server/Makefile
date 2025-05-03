# Makefile for the Agentic Meeting Analysis System

.PHONY: test-collaborative test-collaborative-verbose build clean help

# Default target
help:
	@echo "Usage:"
	@echo "  make build                  - Build the TypeScript source files"
	@echo "  make test-collaborative     - Run the collaborative framework test"
	@echo "  make test-collaborative-verbose - Run the test with verbose logging"
	@echo "  make clean                  - Remove build artifacts"

# Build the TypeScript source files
build:
	@echo "Building TypeScript sources..."
	npx tsc -p tsconfig.build.json

# Run the collaborative framework test
test-collaborative:
	@echo "Running collaborative framework test..."
	npx ts-node test-collaborative-framework.ts

# Run the test with verbose logging
test-collaborative-verbose:
	@echo "Running collaborative framework test with verbose logging..."
	npx ts-node --transpile-only test-collaborative-framework.ts | tee collaborative-test.log

# Run the Phase 5 advanced functionality test
test-phase5:
	@echo "Running Phase 5 advanced functionality test..."
	npx ts-node --transpile-only test-phase5-advanced.ts

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist
	rm -f collaborative-test.log 