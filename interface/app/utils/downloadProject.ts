/**
 * Utility function to download a project as a repository zip file
 */

export interface ProjectFiles {
  html: string;
  css: string;
  js: string;
}

/**
 * Downloads a single file directly (no zip packaging).
 */
export function downloadSingleFile(content: string, filename: string): void {
  const blob = new Blob([content ?? ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats a task name for display in README files
 * Replaces "-" and "_" with spaces and applies title case
 */
function formatTaskNameForReadme(taskName: string): string {
  return taskName
    .replace(/[-_]/g, ' ') // Replace - and _ with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Creates a README.md content for the downloaded project
 */
function createReadme(projectName: string, taskName?: string, taskDescription?: string, customTitle?: string, customDescription?: string): string {
  // Use custom title/description if provided, otherwise use task name/description
  const displayTitle = customTitle || (taskName ? formatTaskNameForReadme(taskName) : undefined);
  const displayDescription = customDescription || taskDescription;
  
  const taskSection = displayTitle ? `\n## Task Information\n\n**Task:** ${displayTitle}\n\n${displayDescription ? `**Description:** ${displayDescription.replace(/<[^>]*>/g, '').trim()}\n` : ''}\n` : '';
  
  return `# ${projectName}

This project was created in [VibeJam](https://vibe-code.umiacs.umd.edu/), a platform for building interactive web projects. If you find this project fun, check out the site to build your own projects with AI assistance and win prizes!

The rest of the repository will describe how to get started with the project and how to host it on GitHub Pages.

## Project Files

This repository contains the following files:

- **\`index.html\`** - The main HTML structure of the project
- **\`styles.css\`** - The CSS stylesheet for the project
- **\`frontend.js\`** - The JavaScript code that powers the project's interactivity

## Getting Started

### Option 1: View Locally

1. Download or clone this repository to your computer
2. Open \`index.html\` in your web browser

### Option 2: Host on GitHub Pages

#### Quick Setup (Recommended)

We've included a \`deploy.sh\` script that automates the GitHub setup process:

1. **Create a GitHub Repository**
   - Go to [GitHub](https://github.com) and sign in (or create an account)
   - Click the "+" icon in the top right and select "New repository"
   - Name your repository (e.g., "${projectName.toLowerCase().replace(/\s+/g, '-')}")
   - Choose whether to make it public or private
   - **Do not** initialize with a README, .gitignore, or license (since this project already has files)
   - Click "Create repository"

2. **Run the Deploy Script**
   - Open Terminal (Mac/Linux) or Git Bash (Windows)
   - Navigate to this project folder:
     \`\`\`bash
     cd path/to/${projectName}
     \`\`\`
   - Make the script executable (Mac/Linux):
     \`\`\`bash
     chmod +x deploy.sh
     \`\`\`
   - Run the script and follow the prompts:
     \`\`\`bash
     ./deploy.sh
     \`\`\`
   - The script will guide you through setting up git, committing files, and pushing to GitHub
   - After pushing, it will provide instructions for enabling GitHub Pages

#### Manual Setup

If you prefer to set up manually or the script doesn't work on your system:

1. **Create a GitHub Repository** (same as above)

2. **Push This Project to GitHub**
   - Open Terminal (Mac/Linux) or Git Bash (Windows)
   - Navigate to this project folder:
     \`\`\`bash
     cd path/to/${projectName}
     \`\`\`
   - Initialize git (if not already initialized):
     \`\`\`bash
     git init
     \`\`\`
   - Add all files:
     \`\`\`bash
     git add .
     \`\`\`
   - Commit the files:
     \`\`\`bash
     git commit -m "Initial commit from VibeJam"
     \`\`\`
   - Connect to your GitHub repository (replace \`YOUR_USERNAME\` and \`YOUR_REPO_NAME\`):
     \`\`\`bash
     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
     git branch -M main
     git push -u origin main
     \`\`\`

3. **Enable GitHub Pages**
   - Go to your repository on GitHub
   - Click on "Settings" (top menu)
   - Scroll down to "Pages" in the left sidebar
   - Under "Source", select "Deploy from a branch"
   - Choose "main" branch and "/ (root)" folder
   - Click "Save"
   - Your site will be available at: \`https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/\`

## Notes

- The project is ready to use as-is - no build process required
- All files are in the root directory for easy GitHub Pages hosting
- You can continue editing these files locally and push updates to GitHub

Enjoy sharing your VibeJam project! 🚀
`;
}

/**
 * Sanitizes a project name to be safe for use as a folder name
 */
function sanitizeProjectName(name: string): string {
  return name
    .replace(/[^a-z0-9\s-]/gi, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .toLowerCase()
    .trim() || 'vibejam-project';
}

/**
 * Creates deploy.sh script content
 */
function createDeployScript(projectName: string): string {
  const sanitizedName = sanitizeProjectName(projectName);
  return `#!/bin/bash

# Deploy script for ${projectName}
# This script helps you push your VibeJam project to GitHub and set up GitHub Pages

set -e  # Exit on error

echo "🚀 VibeJam Project Deployment Script"
echo "======================================"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Error: Git is not installed. Please install Git first."
    echo "   Visit: https://git-scm.com/downloads"
    exit 1
fi

# Check if we're in a git repo
if [ ! -d .git ]; then
    echo "📦 Initializing Git repository..."
    git init
    echo "✅ Git repository initialized"
    echo ""
fi

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Staging all files..."
    git add .
    echo ""
    
    echo "💾 Committing files..."
    git commit -m "Initial commit from VibeJam"
    echo "✅ Files committed"
    echo ""
fi

# Get repository URL
echo "📋 Please provide your GitHub repository URL:"
echo "   Example: https://github.com/username/${sanitizedName}.git"
read -p "Repository URL: " repo_url

if [ -z "$repo_url" ]; then
    echo "❌ Error: Repository URL is required"
    exit 1
fi

# Check if remote already exists
if git remote | grep -q "^origin$"; then
    echo ""
    echo "⚠️  Remote 'origin' already exists."
    read -p "Do you want to update it? (y/n): " update_remote
    if [ "$update_remote" = "y" ] || [ "$update_remote" = "Y" ]; then
        git remote set-url origin "$repo_url"
        echo "✅ Remote URL updated"
    else
        echo "ℹ️  Keeping existing remote"
    fi
else
    git remote add origin "$repo_url"
    echo "✅ Remote added"
fi

echo ""
echo "🌿 Setting default branch to 'main'..."
git branch -M main 2>/dev/null || true
echo "✅ Branch set to main"

echo ""
echo "📤 Pushing to GitHub..."
echo "   You may be prompted for your GitHub credentials"
git push -u origin main

echo ""
echo "✅ Successfully pushed to GitHub!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 Next Steps: Enable GitHub Pages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to your repository on GitHub:"
echo "   \${repo_url%.git}"
echo ""
echo "2. Click on 'Settings' (top menu)"
echo ""
echo "3. Scroll down to 'Pages' in the left sidebar"
echo ""
echo "4. Under 'Source', select 'Deploy from a branch'"
echo ""
echo "5. Choose 'main' branch and '/ (root)' folder"
echo ""
echo "6. Click 'Save'"
echo ""
echo "7. Your site will be available at:"
echo "   \${repo_url#https://github.com/} -> Replace 'github.com' with 'USERNAME.github.io'"
echo "   Example: https://\$(echo \${repo_url#https://github.com/} | cut -d'/' -f1 | sed 's/github.com//').github.io/\$(basename \${repo_url%.git})/"
echo ""
echo "🎉 Deployment complete! Your project will be live in a few minutes."
`;
}

/**
 * Downloads a project as a zip file containing the repository structure
 * @param projectName - Always use the task name for the folder/zip filename (never use customTitle)
 * @param customTitle - Optional custom title for README display only (does not affect folder name)
 * @param customDescription - Optional custom description for README display only
 */
export async function downloadProjectAsRepository(
  files: ProjectFiles,
  projectName: string,
  taskName?: string,
  taskDescription?: string,
  customTitle?: string,
  customDescription?: string
): Promise<void> {
  // Dynamically import JSZip (client-side only)
  let JSZip: any;
  try {
    JSZip = (await import('jszip')).default;
  } catch (error) {
    throw new Error('JSZip library is not installed. Please run: npm install jszip');
  }
  
  const zip = new JSZip();
  // Folder name always uses task name (projectName), never customTitle
  const sanitizedName = sanitizeProjectName(projectName);
  
  // Create the project folder
  const projectFolder = zip.folder(sanitizedName);
  if (!projectFolder) {
    throw new Error('Failed to create project folder in zip');
  }
  
  // Add files to the folder
  projectFolder.file('index.html', files.html || '');
  projectFolder.file('styles.css', files.css || '');
  projectFolder.file('frontend.js', files.js || '');
  projectFolder.file('README.md', createReadme(projectName, taskName, taskDescription, customTitle, customDescription));
  projectFolder.file('deploy.sh', createDeployScript(projectName));
  
  // Generate zip file
  const blob = await zip.generateAsync({ type: 'blob' });
  
  // Create download link and trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizedName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
