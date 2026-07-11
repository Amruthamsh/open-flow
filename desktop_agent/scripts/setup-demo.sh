#!/bin/bash
# Creates a test Downloads folder for the Nova demo

DEMO_DIR="/tmp/nova-test-downloads"

rm -rf "$DEMO_DIR"
mkdir -p "$DEMO_DIR"

# Create sample files with realistic names
touch "$DEMO_DIR/vacation-paris-2024.jpg"
touch "$DEMO_DIR/family-photo.png"
touch "$DEMO_DIR/screenshot-2024-01-15.png"
touch "$DEMO_DIR/sunset.jpeg"
touch "$DEMO_DIR/quarterly-report.pdf"
touch "$DEMO_DIR/invoice-march.pdf"
touch "$DEMO_DIR/resume-final.pdf"
touch "$DEMO_DIR/meeting-notes.docx"
touch "$DEMO_DIR/todo-list.txt"
touch "$DEMO_DIR/app.py"
touch "$DEMO_DIR/index.html"
touch "$DEMO_DIR/styles.css"
touch "$DEMO_DIR/data-export.csv"
touch "$DEMO_DIR/presentation.mp4"
touch "$DEMO_DIR/podcast-episode.mp3"
touch "$DEMO_DIR/project-backup.zip"

echo "Demo folder created at: $DEMO_DIR"
echo "Files:"
ls -la "$DEMO_DIR"
