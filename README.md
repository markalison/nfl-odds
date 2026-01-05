# NFL Playoff Odds (Node.js Version)

This application uses a detailed Monte Carlo simulation backed by real-time data from ESPN.

## Prerequisites
- **Node.js**: You must have Node.js installed on your computer. [Download Here](https://nodejs.org/)

## Installation
1. Open a terminal in this folder: `C:\Users\marka\OneDrive\Desktop\nfl-odds`
2. Run `npm install` to install dependencies (express, axios, cors).

## Running the App
1. Run `npm start` (or `node server.js`).
2. Open your browser to: [http://localhost:3000](http://localhost:3000)

## Features
- **Live Data**: Fetches latest standings and schedule from ESPN API (server-side).
- **Simulation**: Runs 1,000 simulations of the remaining season on the server.
- **Interactive**: Filter by Conference/Division and simulate "What If" scenarios.
