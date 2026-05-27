// app/api/admin/ai/personalize-outreach/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getAI } from '@/lib/ai';

interface BusinessInput {
  id: string;
  name: string;
  category: string;
  city: string;
  rating: number;
  review_count: number;
}

interface PersonalizedOutput {
  id: string;
  personalizedSubject: string;
  personalizedOpening: string;
}

const MAX_BUSINESSES = 50;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const { businesses, template, brandContext, tone } = await req.json();

    // Validate inputs
    if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
      return NextResponse.json({ error: 'businesses array is required' }, { status: 400 });
    }
    if (businesses.length > MAX_BUSINESSES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BUSINESSES} businesses per request` },
        { status: 400 }
      );
    }
    if (!template || !template.subject || !template.body) {
      return NextResponse.json({ error: 'template with subject and body is required' }, { status: 400 });
    }
    if (!brandContext) {
      return NextResponse.json({ error: 'brandContext is required' }, { status: 400 });
    }

    const validTones = ['professional', 'friendly', 'urgent'];
    const selectedTone = validTones.includes(tone) ? tone : 'professional';

    // Build the business list for the prompt
    const businessList = businesses.map((b: BusinessInput, i: number) => (
      `${i + 1}. ID: "${b.id}" | Name: "${b.name}" | Category: "${b.category}" | City: "${b.city}" | Rating: ${b.rating}/5 | Reviews: ${b.review_count}`
    )).join('\n');

    const systemPrompt = `You are an email personalization assistant for ${brandContext}.

For each business listed below, write a personalized email subject line and a 2-3 sentence opening paragraph (in HTML with <p> tags) that:
- References something specific about their business (category, location, or reputation)
- Connects their business needs to roofing/building maintenance
- Feels genuine, not spammy
- Maintains a ${selectedTone} tone

The original template subject is: "${template.subject}"
The original template starts with: "${template.body.substring(0, 200)}..."

Your personalizations should be variations that feel tailored to each specific business while keeping the core message.

Return ONLY a valid JSON array with objects containing: id, personalizedSubject, personalizedOpening
No markdown, no code fences, just the raw JSON array.`;

    const userMessage = `Personalize outreach for these ${businesses.length} businesses:\n\n${businessList}`;

    const ai = getAI();
    const response = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
    }

    let rawText = textBlock.text.trim();

    // Strip markdown code fences if present
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let personalizations: PersonalizedOutput[];
    try {
      personalizations = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response as JSON', raw: rawText },
        { status: 500 }
      );
    }

    // Validate output shape
    if (!Array.isArray(personalizations)) {
      return NextResponse.json({ error: 'AI response is not an array' }, { status: 500 });
    }

    // Ensure every input business has a result (fill in defaults for any missing)
    const resultMap = new Map(personalizations.map(p => [p.id, p]));
    const finalResults: PersonalizedOutput[] = businesses.map((b: BusinessInput) => {
      const existing = resultMap.get(b.id);
      if (existing) return existing;
      // Fallback: use template defaults with basic variable substitution
      return {
        id: b.id,
        personalizedSubject: template.subject.replace(/\{\{\s*name\s*\}\}/g, b.name).replace(/\{\{\s*city\s*\}\}/g, b.city),
        personalizedOpening: `<p>Hi ${b.name},</p>`,
      };
    });

    return NextResponse.json({
      personalizations: finalResults,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI personalization error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
