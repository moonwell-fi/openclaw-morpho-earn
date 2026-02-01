#!/usr/bin/env npx tsx
/**
 * Interactive setup for morpho-yield skill
 * Configures wallet, preferences, and HEARTBEAT.md integration
 * 
 * Usage: npx tsx setup.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'morpho-yield');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const PREFS_PATH = path.join(CONFIG_DIR, 'preferences.json');

interface Config {
  wallet: {
    source: 'file' | 'env' | '1password';
    path?: string;
    env?: string;
    item?: string;
  };
  rpc: string;
}

interface Preferences {
  reportFrequency: 'daily' | 'weekly' | 'on-compound';
  compoundThreshold: number; // USD value to trigger compound
  autoCompound: boolean;
  channel?: string;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function getCompoundFrequency(depositSize: number): { checkFreq: string; description: string } {
  if (depositSize >= 10000) {
    return { checkFreq: 'daily', description: 'Daily (large position)' };
  } else if (depositSize >= 1000) {
    return { checkFreq: 'every 3 days', description: 'Every 3 days (medium position)' };
  } else if (depositSize >= 100) {
    return { checkFreq: 'weekly', description: 'Weekly (small position)' };
  } else {
    return { checkFreq: 'bi-weekly', description: 'Every 2 weeks (minimal position)' };
  }
}

function generateHeartbeatEntry(prefs: Preferences, depositSize: number): string {
  const { checkFreq } = getCompoundFrequency(depositSize);
  
  let entry = `\n## Morpho Yield (Moonwell USDC Vault)\n`;
  entry += `- **Check frequency:** ${checkFreq}\n`;
  entry += `- **Compound threshold:** $${prefs.compoundThreshold.toFixed(2)} in rewards\n`;
  entry += `- **Auto-compound:** ${prefs.autoCompound ? 'Yes' : 'No (notify only)'}\n\n`;
  entry += `### Compound Check\n`;
  entry += `\`\`\`bash\n`;
  entry += `cd ~/clawd/skills/morpho-yield/scripts && npx tsx report.ts --json\n`;
  entry += `\`\`\`\n`;
  entry += `- If \`shouldCompound\` is true and rewards > $${prefs.compoundThreshold.toFixed(2)}:\n`;
  
  if (prefs.autoCompound) {
    entry += `  - Run \`npx tsx compound.ts\` to claim and reinvest\n`;
    entry += `  - Send a report to the user after compounding\n`;
  } else {
    entry += `  - Notify user that rewards are ready to compound\n`;
  }
  
  if (prefs.reportFrequency === 'daily') {
    entry += `- Send daily position report (morning)\n`;
  } else if (prefs.reportFrequency === 'weekly') {
    entry += `- Send weekly position report (Mondays)\n`;
  }
  
  return entry;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  console.log('🌜🌛 Morpho Yield Skill Setup\n');
  console.log('This will configure your wallet and preferences for the Moonwell USDC vault.\n');
  
  // Check existing config
  let config: Config | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    console.log('✅ Existing wallet configuration found.\n');
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } else {
    console.log('No wallet configured yet.\n');
    
    // Wallet setup
    console.log('Wallet Configuration:');
    console.log('  1. Private key file (recommended)');
    console.log('  2. Environment variable');
    console.log('  3. 1Password\n');
    
    const walletChoice = await ask(rl, 'Choose option [1]: ');
    
    config = {
      wallet: { source: 'file' },
      rpc: 'https://rpc.moonwell.fi/main/evm/8453',
    };
    
    if (walletChoice === '2') {
      const envVar = await ask(rl, 'Environment variable name [MORPHO_PRIVATE_KEY]: ');
      config.wallet = {
        source: 'env',
        env: envVar || 'MORPHO_PRIVATE_KEY',
      };
    } else if (walletChoice === '3') {
      const item = await ask(rl, '1Password item name: ');
      config.wallet = {
        source: '1password',
        item: item,
      };
    } else {
      const keyPath = await ask(rl, 'Key file path [~/.clawd/vault/morpho.key]: ');
      config.wallet = {
        source: 'file',
        path: keyPath || '~/.clawd/vault/morpho.key',
      };
    }
    
    // Save config
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`\n✅ Config saved to ${CONFIG_PATH}\n`);
  }
  
  // Preferences
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Notification Preferences\n');
  
  console.log('How often would you like position reports?');
  console.log('  1. Daily');
  console.log('  2. Weekly');
  console.log('  3. Only when compounding\n');
  
  const reportChoice = await ask(rl, 'Choose option [2]: ');
  const reportFrequency = reportChoice === '1' ? 'daily' 
    : reportChoice === '3' ? 'on-compound' 
    : 'weekly';
  
  const thresholdInput = await ask(rl, 'Minimum rewards to trigger compound [$0.50]: ');
  const compoundThreshold = parseFloat(thresholdInput) || 0.50;
  
  const autoInput = await ask(rl, 'Auto-compound when threshold reached? [Y/n]: ');
  const autoCompound = autoInput.toLowerCase() !== 'n';
  
  const depositInput = await ask(rl, 'Approximate deposit size in USDC [$100]: ');
  const depositSize = parseFloat(depositInput) || 100;
  
  const prefs: Preferences = {
    reportFrequency,
    compoundThreshold,
    autoCompound,
  };
  
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
  console.log(`\n✅ Preferences saved to ${PREFS_PATH}\n`);
  
  // Generate HEARTBEAT.md entry
  const { description } = getCompoundFrequency(depositSize);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Recommended Check Schedule\n');
  console.log(`Based on your ~$${depositSize} deposit:`);
  console.log(`  Compound check: ${description}`);
  console.log(`  Reports: ${reportFrequency}\n`);
  
  const heartbeatEntry = generateHeartbeatEntry(prefs, depositSize);
  
  console.log('Add this to your HEARTBEAT.md:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(heartbeatEntry);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const addToHeartbeat = await ask(rl, 'Add to HEARTBEAT.md automatically? [Y/n]: ');
  
  if (addToHeartbeat.toLowerCase() !== 'n') {
    const heartbeatPath = path.join(process.env.HOME || '~', 'clawd', 'HEARTBEAT.md');
    
    if (fs.existsSync(heartbeatPath)) {
      let content = fs.readFileSync(heartbeatPath, 'utf-8');
      
      // Remove existing morpho section if present
      content = content.replace(/\n## Morpho Yield[\s\S]*?(?=\n## |$)/, '');
      
      // Add new entry
      content = content.trimEnd() + '\n' + heartbeatEntry;
      fs.writeFileSync(heartbeatPath, content);
      console.log('✅ Added to HEARTBEAT.md\n');
    } else {
      console.log(`⚠️ HEARTBEAT.md not found at ${heartbeatPath}`);
      console.log('Please add the entry manually.\n');
    }
  }
  
  console.log('🎉 Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Fund your wallet with USDC and ETH (for gas) on Base');
  console.log('  2. Run: npx tsx deposit.ts <amount>');
  console.log('  3. Your agent will monitor and compound automatically!\n');
  
  rl.close();
}

main().catch(console.error);
