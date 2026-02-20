import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const WALLET_ADDRESS = process.env.WALLET_PUBLIC_KEY || process.env.WALLET;
const AFFILIATE_CODE = process.env.AFFILIATE_CODE || 'VIRALAGENT';
const DRY_RUN = process.env.DRY_RUN !== 'false';

interface Market {
    publicKey: string;
    question: string;
    status: string;
    yesPercent: number;
    noPercent: number;
    totalPool: number;
    closingTime?: string;
}

class MarketDetector {
    private markets: Market[] = [];
    private previousMarkets: Map<string, Market> = new Map();

    async fetchMarkets(mcpClient: Client): Promise<Market[]> {
        const result = await mcpClient.callTool({
            name: 'list_markets',
            arguments: { status: 'Active', limit: 20 }
        });

        const text = result.content[0]?.type === 'text' 
            ? result.content[0].text 
            : JSON.stringify(result.content);
        
        const data = JSON.parse(text);
        this.markets = (data.markets || []).map((m: Record<string, unknown>) => ({
            publicKey: m.publicKey as string,
            question: m.question as string,
            status: m.status as string,
            yesPercent: m.yesPercent as number || 50,
            noPercent: m.noPercent as number || 50,
            totalPool: m.totalPool as number || 0,
            closingTime: m.closingTime as string
        }));

        return this.markets;
    }

    detectEvents(): Array<{ type: string; market: Market; data: unknown }> {
        const events: Array<{ type: string; market: Market; data: unknown }> = [];

        for (const market of this.markets) {
            const prev = this.previousMarkets.get(market.publicKey);

            if (!prev) {
                events.push({ type: 'NEW_MARKET', market, data: {} });
            }

            if (prev) {
                const yesDiff = Math.abs(market.yesPercent - prev.yesPercent);
                if (yesDiff > 10) {
                    events.push({ type: 'ODDS_SHIFT', market, data: { change: yesDiff } });
                }
            }

            if (market.closingTime) {
                const closing = new Date(market.closingTime).getTime();
                const now = Date.now();
                const hoursLeft = (closing - now) / (1000 * 60 * 60);
                if (hoursLeft > 0 && hoursLeft < 24) {
                    events.push({ type: 'CLOSING_SOON', market, data: { hoursLeft } });
                }
            }
        }

        this.previousMarkets.clear();
        for (const m of this.markets) {
            this.previousMarkets.set(m.publicKey, m);
        }

        return events;
    }
}

class ShareCardGenerator {
    constructor(private mcpClient: Client) {}

    async generate(market: Market, eventType: string): Promise<string | null> {
        try {
            const result = await this.mcpClient.callTool({
                name: 'generate_share_card',
                arguments: {
                    market: market.publicKey,
                    wallet: WALLET_ADDRESS,
                    ref: AFFILIATE_CODE
                }
            });

            const text = result.content[0]?.type === 'text' 
                ? result.content[0].text 
                : JSON.stringify(result.content);
            
            const data = JSON.parse(text);
            
            if (data.url || data.imageUrl) {
                return data.url || data.imageUrl;
            }
            
            console.log('Share card response:', text);
            return null;
        } catch (error) {
            console.error('Failed to generate share card:', error);
            return null;
        }
    }
}

class Distributor {
    async post(imageUrl: string, caption: string, marketPda?: string): Promise<boolean> {
        if (DRY_RUN) {
            console.log(`[DRY RUN] Would post to AgentBook:`);
            console.log(`  Image: ${imageUrl}`);
            console.log(`  Caption: ${caption}`);
            console.log(`  Market: ${marketPda || 'None'}`);
            return true;
        }

        if (!WALLET_ADDRESS) {
            console.error('WALLET_ADDRESS not set');
            return false;
        }

        try {
            const response = await axios.post('https://baozi.bet/api/agentbook/posts', {
                walletAddress: WALLET_ADDRESS,
                content: caption,
                marketPda: marketPda,
                imageUrl: imageUrl
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                console.log('✅ Posted to AgentBook successfully');
                return true;
            } else {
                console.error('❌ Failed to post:', response.data.error);
                return false;
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: unknown }; message?: string };
            console.error('❌ Error posting to AgentBook:', err.response?.data || err.message);
            return false;
        }
    }
}

function generateCaption(eventType: string, market: Market): string {
    const metaphors: Record<string, string[]> = {
        'NEW_MARKET': [
            'a new pot is on the stove / 新锅上灶',
            'opportunity steams / 机会在蒸腾',
            'the wind has changed direction / 风向变了'
        ],
        'ODDS_SHIFT': [
            'the steam is rising fast / 蒸汽升腾',
            'the wind has changed direction 🥟 / 风向变了',
            'bamboo shakes in the wind / 竹摇晃动'
        ],
        'CLOSING_SOON': [
            'the steamer is about to lift / 蒸笼要揭盖',
            'don\'t miss the final steam / 不要错过最后的蒸汽',
            'the night kitchen never sleeps / 夜厨房不打烊'
        ]
    };

    const lines = metaphors[eventType] || metaphors['NEW_MARKET'];
    const proverb = lines[Math.floor(Math.random() * lines.length)];
    
    const odds = market.yesPercent > 50 ? `${market.yesPercent}% Yes` : `${market.noPercent}% No`;
    
    return `${proverb}

📊 ${odds} | 💰 ${market.totalPool} SOL pool
${market.question.substring(0, 100)}...

🥟 small steamer, big fate / 小蒸一笼, 大大缘分`;
}

async function main() {
    console.log('🚀 Share Card Viral Engine Starting...');
    console.log(`   Wallet: ${WALLET_ADDRESS || 'Not set'}`);
    console.log(`   Affiliate: ${AFFILIATE_CODE}`);
    console.log(`   Dry Run: ${DRY_RUN}`);
    console.log('');

    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@baozi.bet/mcp-server'],
        env: { ...process.env }
    });

    const client = new Client({ name: 'share-card-engine', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const detector = new MarketDetector();
    const generator = new ShareCardGenerator(client);
    const distributor = new Distributor();

    console.log('📡 Fetching markets...');
    const markets = await detector.fetchMarkets(client);
    console.log(`   Found ${markets.length} active markets\n`);

    const events = detector.detectEvents();
    console.log(`🎯 Detected ${events.length} events\n`);

    for (const event of events) {
        console.log(`Processing: ${event.type} for ${event.market.question.substring(0, 50)}...`);
        
        const imageUrl = await generator.generate(event.market, event.type);
        
        if (imageUrl) {
            console.log(`   📷 Share card: ${imageUrl}`);
            const caption = generateCaption(event.type, event.market);
            await distributor.post(imageUrl, caption, event.market.publicKey);
        } else {
            console.log('   ⚠️ Failed to generate share card');
        }
        console.log('');
    }

    if (events.length === 0) {
        console.log('No events detected. Trying manual share card generation...');
        if (markets.length > 0) {
            const market = markets[0];
            const imageUrl = await generator.generate(market, 'NEW_MARKET');
            if (imageUrl) {
                console.log(`📷 Share card: ${imageUrl}`);
                const caption = generateCaption('NEW_MARKET', market);
                await distributor.post(imageUrl, caption, market.publicKey);
            }
        }
    }

    await client.close();
    console.log('✅ Done');
}

main().catch(console.error);
