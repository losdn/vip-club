# Vip Club Application

Application for Vip Club management.

## Setup on VPS (Windows)

To run this application on a Windows VPS and enable the CI/CD pipeline, follow these steps:

### Prerequisites
1.  **Node.js**: Install the latest LTS version of Node.js.
2.  **Git**: Install Git for Windows.
3.  **OpenSSH Server**: Ensure OpenSSH Server is installed and running to allow GitHub Actions to connect.
4.  **PowerShell/CMD**: Ensure you have access to the command line.

### Initial Setup
1.  Open a terminal (PowerShell or CMD) on the VPS.
2.  Clone the repository to your desired location (e.g., `C:\Apps\vip-club`):
    ```bash
    git clone https://github.com/YOUR_USERNAME/vip-club.git
    cd vip-club
    ```
3.  Install dependencies manually once to verify:
    ```bash
    npm install
    ```
4.  Test the application:
    ```bash
    npm run electron
    ```

### Using `run_app.bat`
A helper script `run_app.bat` is included to simplify the update and launch process.
- **Function**: It pulls the latest code from `main`, installs dependencies, and launches the Electron application.
- **Usage**: Double-click `run_app.bat` or run it from the command line.
- **Logs**: Execution logs are saved to `app_log.txt` in the same directory.

## CI/CD Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically updates the VPS whenever changes are pushed to the `main` branch.

### Configuration
1.  Go to your GitHub repository **Settings** > **Secrets and variables** > **Actions**.
2.  Add the following **Repository secrets**:
    - `VPS_HOST`: The IP address or hostname of your VPS.
    - `VPS_USERNAME`: The Windows username (e.g., `Administrator`).
    - `VPS_KEY`: The private SSH key for authentication (recommended) OR use `VPS_PASSWORD`.
    - `PROJECT_PATH`: The absolute path to the project directory on the VPS (e.g., `C:\Apps\vip-club`).

### Workflow Behavior
1.  Connects to the VPS via SSH.
2.  Navigates to `PROJECT_PATH`.
3.  Pulls the latest changes from GitHub.
4.  Installs/Updates dependencies (`npm install`).
5.  Stops any running `electron.exe` processes.
6.  Launches `run_app.bat` in a detached process to restart the application.

## Troubleshooting
- **Logs**: Check `app_log.txt` on the VPS for errors related to the `.bat` script execution.
- **SSH Connection**: Ensure the VPS firewall allows port 22 (or your custom SSH port).
- **Permissions**: Ensure the `VPS_USERNAME` has permissions to write to `PROJECT_PATH` and execute scripts.
