.PHONY: setup dev test lint format build

setup:
	npm install
	bash scripts/install-hooks.sh

dev:
	npm run dev

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

build:
	npm run build
