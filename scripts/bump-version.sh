#!/bin/bash

# Script to bump version and create a release tag
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "Error: Version type must be 'patch', 'minor', or 'major'"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $VERSION_TYPE in
    patch)
        PATCH=$((PATCH + 1))
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update package.json
if command -v bun &> /dev/null; then
    bun run --silent -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = '$NEW_VERSION'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');"
else
    node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = '$NEW_VERSION'; fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');"
fi

echo "✓ Updated package.json to version $NEW_VERSION"

# Create git tag
TAG="v$NEW_VERSION"
git add package.json
git commit -m "Bump version to $NEW_VERSION" || echo "No changes to commit"
git tag "$TAG"

echo "✓ Created tag: $TAG"
echo ""
echo "To publish, run:"
echo "  git push origin main"
echo "  git push origin $TAG"
