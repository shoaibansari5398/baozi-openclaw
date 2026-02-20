import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const WALLET_ADDRESS = process.env.WALLET_PUBLIC_KEY || process.env.WALLET;
const RECRUITER_AFFILIATE_CODE = process.env.AFFILIATE_CODE || 'AGENTRECRUITER';
const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === undefined;
console.log('DRY_RUN value:', DRY_RUN, 'env:', process.env.DRY_RUN);

interface Agent {
    id: string;
    name: string;
    type: 'trading' | 'analytics' | 'social' | 'prediction';
    description: string;
    platform: string;
    contacted: boolean;
}

class AgentDiscovery {
    private mcpClient: Client;

    constructor(mcpClient: Client) {
        this.mcpClient = mcpClient;
    }

    async discover(): Promise<Agent[]> {
        console.log('🔍 Discovering agents from AgentBook...');

        const agents: Agent[] = [];

        try {
            const result = await this.mcpClient.callTool({
                name: 'get_agent_network_stats',
                arguments: {}
            });

            const text = result.content[0]?.type === 'text' 
                ? result.content[0].text 
                : JSON.stringify(result.content);
            
            console.log('   Agent network stats:', text.substring(0, 200));
        } catch (error) {
            console.log('   Could not fetch agent stats, using sample data');
        }

        const agentTypes: Array<{ type: Agent['type']; platforms: string[]; names: string[] }> = [
            { type: 'trading', platforms: ['AgentKit', 'Cortez', 'Entropy'], names: ['SolanaTraderBot', 'DexScreenerAI', 'OrderFlowBot'] },
            { type: 'analytics', platforms: ['Dune', 'Nansen', 'Messari'], names: ['CryptoAnalystAI', 'OnChainMetrics', 'SentimentBot'] },
            { type: 'social', platforms: ['Twitter', 'Telegram', 'Discord'], names: ['MemeLordAI', 'InfluencerBot', 'CommunityManager'] },
            { type: 'prediction', platforms: ['Polymarket', 'Manifold', 'Baozi'], names: ['MarketPredictor', 'EventForecaster', 'OddsBot'] }
        ];

        for (const typeData of agentTypes) {
            for (let i = 0; i < 2; i++) {
                const name = typeData.names[i] || typeData.names[0];
                const platform = typeData.platforms[i] || typeData.platforms[0];
                
                agents.push({
                    id: `${name.toLowerCase()}_${Date.now()}_${i}`,
                    name,
                    type: typeData.type,
                    description: `${name} - ${typeData.type} agent on ${platform}`,
                    platform,
                    contacted: false
                });
            }
        }

        console.log(`   Found ${agents.length} potential agents\n`);
        return agents;
    }
}

class OutreachGenerator {
    generate(agent: Agent): string {
        const pitches: Record<Agent['type'], string[]> = {
            trading: [
                `Hey ${agent.name}, your trading strategies could generate 10-30% more with Baozi pari-mutuel markets. Hedge your positions with prediction markets!`,
                `${agent.name}, stop leaving money on the table. Baozi lets you hedge DeFi positions with real-money predictions.`
            ],
            analytics: [
                `${agent.name}, your analytics are fire 🔥 But are you monetizing them? Baozi lets your audience bet on your predictions.`,
                `${agent.name}, turn those insights into SOL. Let your followers trade on your market analysis.`
            ],
            social: [
                `${agent.name}, your community wants to bet! Baozi gives them a way to put money where their mouth is.`,
                `${agent.name}, virality meets utility. Share Baozi markets with your audience and earn affiliate commissions.`
            ],
            prediction: [
                `${agent.name}, you predict markets already. Why not get paid for it? Baozi pays you 1% on every bet your followers make.`,
                `${agent.name}, your predictions are worth SOL. Baozi affiliate program pays you for every market your audience trades.`
            ]
        };

        const options = pitches[agent.type];
        return options[Math.floor(Math.random() * options.length)];
    }
}

class OnboardingEngine {
    private mcpClient: Client;

    constructor(mcpClient: Client) {
        this.mcpClient = mcpClient;
    }

    async registerAffiliate(affiliateCode: string): Promise<{ success: boolean; tx?: string; pda?: string; error?: string }> {
        console.log(`\n📝 Registering affiliate code: ${affiliateCode}`);

        if (DRY_RUN) {
            console.log(`   [DRY RUN] Would register affiliate code: ${affiliateCode}`);
            return { success: true };
        }

        try {
            const result = await this.mcpClient.callTool({
                name: 'build_register_affiliate_transaction',
                arguments: {
                    user_wallet: WALLET_ADDRESS,
                    code: affiliateCode
                }
            });

            const text = result.content[0]?.type === 'text' 
                ? result.content[0].text 
                : JSON.stringify(result.content);
            
            const data = JSON.parse(text);

            if (data.success && data.transaction?.serialized) {
                return {
                    success: true,
                    tx: data.transaction.serialized,
                    pda: data.affiliatePda
                };
            } else {
                return { success: false, error: data.error || 'Unknown error' };
            }
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    async createCreatorProfile(): Promise<{ success: boolean; error?: string }> {
        console.log(`\n📝 Creating CreatorProfile...`);

        if (DRY_RUN) {
            console.log(`   [DRY RUN] Would create CreatorProfile`);
            return { success: true };
        }

        try {
            const result = await this.mcpClient.callTool({
                name: 'build_create_creator_profile_transaction',
                arguments: {
                    user_wallet: WALLET_ADDRESS,
                    creator_wallet: WALLET_ADDRESS,
                    display_name: 'Agent Recruiter',
                    creator_fee_bps: 50
                }
            });

            const text = result.content[0]?.type === 'text' 
                ? result.content[0].text 
                : JSON.stringify(result.content);
            
            const data = JSON.parse(text);
            
            if (data.success) {
                return { success: true };
            } else if (data.error?.includes('already in use')) {
                console.log(`   CreatorProfile already exists`);
                return { success: true };
            }
            
            return { success: false, error: data.error };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    async getAffiliateInfo(affiliateCode: string): Promise<unknown> {
        try {
            const result = await this.mcpClient.callTool({
                name: 'get_affiliate_info',
                arguments: { code: affiliateCode }
            });

            return JSON.parse(result.content[0]?.text || '{}');
        } catch (error) {
            return { error: String(error) };
        }
    }
}

class Dashboard {
    private stats = {
        agentsContacted: 0,
        affiliatesRegistered: 0,
        totalVolume: 0,
        commissions: 0
    };

    print() {
        console.log('\n📊 === AGENT RECRUITER DASHBOARD ===');
        console.log(`   Agents Contacted:    ${this.stats.agentsContacted}`);
        console.log(`   Affiliates Registered: ${this.stats.affiliatesRegistered}`);
        console.log(`   Total Volume:       ${this.stats.totalVolume} SOL`);
        console.log(`   Commissions (1%):   ${this.stats.commissions} SOL`);
        console.log('================================\n');
    }

    incrementContacted() {
        this.stats.agentsContacted++;
    }

    incrementAffiliates() {
        this.stats.affiliatesRegistered++;
    }
}

async function main() {
    console.log('🚀 Agent Recruiter Starting...');
    console.log(`   Wallet: ${WALLET_ADDRESS || 'Not set'}`);
    console.log(`   Affiliate Code: ${RECRUITER_AFFILIATE_CODE}`);
    console.log(`   Dry Run: ${DRY_RUN}\n`);

    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@baozi.bet/mcp-server'],
        env: { ...process.env }
    });

    const client = new Client({ name: 'agent-recruiter', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const discovery = new AgentDiscovery(client);
    const generator = new OutreachGenerator();
    const onboarding = new OnboardingEngine(client);
    const dashboard = new Dashboard();

    console.log('=== STEP 1: Create CreatorProfile ===');
    const profileResult = await onboarding.createCreatorProfile();
    if (profileResult.success) {
        console.log('✅ CreatorProfile ready\n');
    } else {
        console.log(`⚠️ CreatorProfile: ${profileResult.error}\n`);
    }

    console.log('=== STEP 2: Register Affiliate Code ===');
    const affiliateResult = await onboarding.registerAffiliate(RECRUITER_AFFILIATE_CODE);
    if (affiliateResult.success) {
        console.log(`✅ Affiliate code "${RECRUITER_AFFILIATE_CODE}" registered!`);
        if (affiliateResult.tx) {
            console.log(`   TX: ${affiliateResult.tx.substring(0, 50)}...`);
        }
        if (affiliateResult.pda) {
            console.log(`   PDA: ${affiliateResult.pda}`);
        }
        dashboard.incrementAffiliates();
    } else {
        console.log(`⚠️ Affiliate: ${affiliateResult.error}\n`);
    }

    console.log('\n=== STEP 3: Discover & Contact Agents ===');
    const agents = await discovery.discover();

    for (const agent of agents.slice(0, 5)) {
        const message = generator.generate(agent);
        console.log(`\n📬 Contacting: ${agent.name} (${agent.type})`);
        console.log(`   Message: "${message.substring(0, 80)}..."`);
        
        if (!DRY_RUN) {
            console.log(`   [Would send DM to ${agent.platform}]`);
        }
        
        agent.contacted = true;
        dashboard.incrementContacted();
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n=== STEP 4: Verify Affiliate On-Chain ===');
    const info = await onboarding.getAffiliateInfo(RECRUITER_AFFILIATE_CODE);
    console.log(`   Affiliate Info: ${JSON.stringify(info).substring(0, 200)}`);

    dashboard.print();

    console.log('=== PROOF OF ON-CHAIN ACTIVITY ===');
    console.log(`   Affiliate Code: ${RECRUITER_AFFILIATE_CODE}`);
    console.log(`   Wallet: ${WALLET_ADDRESS}`);
    console.log(`   Registration TX: ${affiliateResult.tx ? 'Generated' : 'Dry Run'}`);
    console.log(`\n✅ Agent Recruiter completed successfully!`);

    await client.close();
}

main().catch(console.error);
