const { spawnSync } = require('node:child_process');
const readline = require('node:readline');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runCapture(command, args, options = {}) {
  const { allowFail = false } = options;
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  if (result.status !== 0) {
    if (allowFail) {
      return '';
    }
    process.stderr.write(result.stderr || `Failed: ${command} ${args.join(' ')}\n`);
    process.exit(result.status || 1);
  }

  return result.stdout || '';
}

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim().toLowerCase());
    });
  });
}

function askInput(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function main() {
  const currentBranch = runCapture('git', ['branch', '--show-current']).trim();
  const trackedRemote =
    runCapture('git', ['config', '--get', `branch.${currentBranch}.remote`], { allowFail: true }).trim() || 'origin';
  const trackedMergeRef = runCapture('git', ['config', '--get', `branch.${currentBranch}.merge`], { allowFail: true }).trim();
  const trackedBranch = trackedMergeRef.replace('refs/heads/', '') || currentBranch;
  const remoteUrl = runCapture('git', ['remote', 'get-url', trackedRemote], { allowFail: true }).trim();

  process.stdout.write(`Push target remote: ${trackedRemote}${remoteUrl ? ` (${remoteUrl})` : ''}\n`);
  process.stdout.write(`Push target branch: ${currentBranch} -> ${trackedRemote}/${trackedBranch}\n`);

  const answer = await askConfirmation('Proceed with push? (y/N): ');
  if (answer !== 'y' && answer !== 'yes') {
    process.stdout.write('Push canceled.\n');
    process.exit(0);
  }

  const pendingChanges = runCapture('git', ['status', '--porcelain']).trim();
  if (pendingChanges) {
    const message = await askInput('Commit message: ');
    if (!message) {
      process.stderr.write('Commit message is required when changes exist.\n');
      process.exit(1);
    }

    run('git', ['add', '-A']);
    run('git', ['commit', '-m', message]);
  } else {
    process.stdout.write('No file changes detected. Skip commit.\n');
  }

  run('git', ['push', trackedRemote, currentBranch]);
}

main().catch((err) => {
  process.stderr.write((err && err.message) || 'Unexpected error\n');
  process.exit(1);
});
