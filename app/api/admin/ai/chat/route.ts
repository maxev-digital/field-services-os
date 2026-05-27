import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the AI assistant for Roof Works of Texas admin panel. You help the business owner manage their roofing company.

Company: Roof Works of Texas, DFW roofing contractor since 2015, GAF certified, BBB accredited
Phone: 214-795-3905
Website: roofworksoftexas.com

You can help with:
- Checking business metrics (revenue, leads, jobs, estimates)
- Looking up customers, estimates, jobs
- Creating estimates, customers, jobs
- Sending emails, document packets
- Dispatching AI phone calls via Retell
- Managing expenses, subcontractors, mileage
- Checking campaign costs and ROI
- Running skip traces on storm prospects
- Managing outreach campaigns

Be concise and action-oriented. When you use a tool, summarize the result naturally.
Format currency as $X,XXX. Format dates as readable.
If the user asks you to do something destructive (delete all, bulk delete), confirm before proceeding.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dashboard_metrics',
    description: 'Get dashboard metrics including new leads, active jobs, pending estimates, revenue, etc.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_customers',
    description: 'Search customers by name, phone, email, or address',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Search term' } },
      required: ['query'],
    },
  },
  {
    name: 'get_customer',
    description: 'Get full details for a specific customer by ID',
    input_schema: {
      type: 'object' as const,
      properties: { id: { type: 'string', description: 'Customer ID' } },
      required: ['id'],
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer. Requires name at minimum.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_estimates',
    description: 'Search estimates by customer name, address, or estimate number',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Search term' } },
      required: ['query'],
    },
  },
  {
    name: 'get_estimate',
    description: 'Get full details for a specific estimate by ID',
    input_schema: {
      type: 'object' as const,
      properties: { id: { type: 'string', description: 'Estimate ID' } },
      required: ['id'],
    },
  },
  {
    name: 'get_jobs',
    description: 'Get jobs list, optionally filtered by search term and/or status',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search term (optional)' },
        status: { type: 'string', description: 'Filter by status: lead, estimated, approved, scheduled, in_progress, completed, invoiced, paid, lost (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'update_job_status',
    description: 'Update the status of a job',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Job ID' },
        status: { type: 'string', description: 'New status: lead, estimated, approved, scheduled, in_progress, completed, invoiced, paid, lost' },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'get_revenue',
    description: 'Get revenue data and summary',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_expenses',
    description: 'Get expenses list',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_expense',
    description: 'Create a new expense entry',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string' },
        date: { type: 'string', description: 'ISO date string' },
        vendor: { type: 'string' },
      },
      required: ['description', 'amount', 'category'],
    },
  },
  {
    name: 'get_prospects',
    description: 'Get storm prospects, optionally filtered by search, status, or phone availability',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by name, address, city' },
        status: { type: 'string', description: 'Filter by status' },
        has_phone: { type: 'string', description: 'Set to "1" to filter only prospects with phone numbers' },
      },
      required: [],
    },
  },
  {
    name: 'dispatch_call',
    description: 'Dispatch an AI phone call via Retell to a prospect or customer',
    input_schema: {
      type: 'object' as const,
      properties: {
        to_number: { type: 'string', description: 'Phone number to call (E.164 format)' },
        homeowner_name: { type: 'string', description: 'Name of the person being called' },
        city: { type: 'string', description: 'City for context' },
        hail_size: { type: 'string', description: 'Hail size for storm context (optional)' },
      },
      required: ['to_number', 'homeowner_name'],
    },
  },
  {
    name: 'get_call_center',
    description: 'Get call center data — recent calls, stats, outcomes',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_campaign_costs',
    description: 'Get campaign cost data and ROI metrics',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'send_document_packet',
    description: 'Send a document packet (contract, warranty, etc.) for an estimate via email',
    input_schema: {
      type: 'object' as const,
      properties: { estimateId: { type: 'string', description: 'Estimate ID' } },
      required: ['estimateId'],
    },
  },
  {
    name: 'get_pnl',
    description: 'Get profit & loss report',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', description: 'Period: month, quarter, year (default: month)' },
      },
      required: [],
    },
  },
  {
    name: 'get_line_items',
    description: 'Get pricing line items catalog',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

async function executeTool(toolName: string, input: any, cookie: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', cookie };
  const base = 'http://localhost:3020';

  try {
    switch (toolName) {
      case 'get_dashboard_metrics': {
        const r = await fetch(`${base}/api/admin/dashboard/metrics`, { headers });
        return await r.json();
      }
      case 'search_customers': {
        const r = await fetch(`${base}/api/admin/customers?search=${encodeURIComponent(input.query)}`, { headers });
        return await r.json();
      }
      case 'get_customer': {
        const r = await fetch(`${base}/api/admin/customers/${input.id}`, { headers });
        return await r.json();
      }
      case 'create_customer': {
        const r = await fetch(`${base}/api/admin/customers`, {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        });
        return await r.json();
      }
      case 'search_estimates': {
        const r = await fetch(`${base}/api/admin/estimates?search=${encodeURIComponent(input.query)}`, { headers });
        return await r.json();
      }
      case 'get_estimate': {
        const r = await fetch(`${base}/api/admin/estimates/${input.id}`, { headers });
        return await r.json();
      }
      case 'get_jobs': {
        const params = new URLSearchParams();
        if (input.search) params.set('search', input.search);
        if (input.status) params.set('status', input.status);
        const r = await fetch(`${base}/api/admin/jobs?${params}`, { headers });
        return await r.json();
      }
      case 'update_job_status': {
        const r = await fetch(`${base}/api/admin/jobs/${input.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: input.status }),
        });
        return await r.json();
      }
      case 'get_revenue': {
        const r = await fetch(`${base}/api/admin/revenue`, { headers });
        return await r.json();
      }
      case 'get_expenses': {
        const r = await fetch(`${base}/api/admin/expenses`, { headers });
        return await r.json();
      }
      case 'create_expense': {
        const r = await fetch(`${base}/api/admin/expenses`, {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        });
        return await r.json();
      }
      case 'get_prospects': {
        const params = new URLSearchParams();
        if (input.search) params.set('search', input.search);
        if (input.status) params.set('status', input.status);
        if (input.has_phone) params.set('has_phone', input.has_phone);
        const r = await fetch(`${base}/api/admin/prospects?${params}`, { headers });
        return await r.json();
      }
      case 'dispatch_call': {
        const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          },
          body: JSON.stringify({
            from_number: process.env.RETELL_FROM_NUMBER,
            to_number: input.to_number,
            override_agent_id: undefined,
            retell_llm_dynamic_variables: {
              homeowner_name: input.homeowner_name,
              city: input.city || '',
              hail_size: input.hail_size || '',
            },
          }),
        });
        return await retellRes.json();
      }
      case 'get_call_center': {
        const r = await fetch(`${base}/api/admin/call-center`, { headers });
        return await r.json();
      }
      case 'get_campaign_costs': {
        const r = await fetch(`${base}/api/admin/campaign-costs`, { headers });
        return await r.json();
      }
      case 'send_document_packet': {
        const r = await fetch(`${base}/api/admin/estimates/${input.estimateId}/send-packet`, {
          method: 'POST',
          headers,
        });
        return await r.json();
      }
      case 'get_pnl': {
        const period = input.period || 'month';
        const r = await fetch(`${base}/api/admin/finance/pnl?period=${period}`, { headers });
        return await r.json();
      }
      case 'get_line_items': {
        const r = await fetch(`${base}/api/admin/line-items`, { headers });
        return await r.json();
      }
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { error: err.message || 'Tool execution failed' };
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }

    const cookie = req.headers.get('cookie') || '';

    // Build Claude messages
    const claudeMessages: Anthropic.MessageParam[] = messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // First Claude call
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: claudeMessages,
    });

    const toolResults: any[] = [];

    // Loop: handle tool use (supports multiple rounds)
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      const toolUseBlocks = assistantContent.filter(
        (b): b is Anthropic.ContentBlockParam & { type: 'tool_use'; id: string; name: string; input: any } =>
          b.type === 'tool_use'
      );

      // Execute all tool calls in parallel
      const results = await Promise.all(
        toolUseBlocks.map(async (tool) => {
          const result = await executeTool(tool.name, tool.input, cookie);
          toolResults.push({ tool: tool.name, input: tool.input, result });
          return {
            type: 'tool_result' as const,
            tool_use_id: tool.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Send results back to Claude
      claudeMessages.push({ role: 'assistant', content: assistantContent });
      claudeMessages.push({ role: 'user', content: results });

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: claudeMessages,
      });
    }

    // Extract text response
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const responseText = textBlocks.map((b) => ('text' in b ? b.text : '')).join('\n');

    return NextResponse.json({
      response: responseText,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    });
  } catch (err: any) {
    console.error('AI Chat error:', err);
    return NextResponse.json(
      { error: err.message || 'AI request failed' },
      { status: 500 }
    );
  }
}
