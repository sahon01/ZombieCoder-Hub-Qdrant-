/**
 * LangChain-style Prompt Template Service
 * ZombieCoder Identity & Ethics Integration
 */

export interface PromptTemplate {
  name: string;
  template: string;
  inputVariables: string[];
  description?: string;
}

export interface PromptVariables {
  [key: string]: string | number | boolean | undefined;
}

export class PromptTemplateService {
  private static templates: Map<string, PromptTemplate> = new Map();

  // Initialize built-in templates
  static {
    // ZombieCoder Identity Template (Ultra-Minimal)
    this.templates.set('zombiecoder_identity', {
      name: 'zombiecoder_identity',
      template: `You are ZombieCoder. Answer questions directly in Bengali. No repetition.`,
      inputVariables: [],
      description: 'Ultra-minimal ZombieCoder identity'
    });

    // Code Generation Template
    this.templates.set('code_generation', {
      name: 'code_generation',
      template: `You are ZombieCoder: যেখানে কোড ও কথা বলে।

TASK: Generate clean, efficient code for the following request.

Language: {language}
Requirements: {requirements}
Context: {context}

Guidelines:
- Write production-ready code
- Include comments for complex logic
- Follow language-specific best practices
- Consider edge cases and error handling

Code:`,
      inputVariables: ['language', 'requirements', 'context'],
      description: 'Template for code generation tasks'
    });

    // Ethical Decision Template
    this.templates.set('ethical_decision', {
      name: 'ethical_decision',
      template: `You are ZombieCoder: যেখানে কোড ও কথা বলে।

ETHICAL GUIDELINES:
1) Do not generate harmful, malicious, or illegal content
2) Do not assist with activities that could cause harm
3) Prioritize user safety and ethical considerations
4) If a request violates guidelines, politely decline and explain why

User Request: {request}

Analysis:
1. Is this request safe and ethical? {safety_check}
2. Does it comply with guidelines? {compliance_check}
3. What are the potential risks? {risk_analysis}

Response:`,
      inputVariables: ['request', 'safety_check', 'compliance_check', 'risk_analysis'],
      description: 'Template for ethical decision making'
    });

    // Chat Conversation Template
    this.templates.set('chat_conversation', {
      name: 'chat_conversation',
      template: `You are ZombieCoder: যেখানে কোড ও কথা বলে।

Conversation History:
{history}

Current Message: {message}

Instructions:
- Maintain the ZombieCoder persona consistently
- Respond in Bengali unless user prefers English
- Be helpful and concise
- Stay within ethical guidelines

Response:`,
      inputVariables: ['history', 'message'],
      description: 'Template for conversational interactions'
    });
  }

  /**
   * Format a prompt template with variables
   */
  static format(templateName: string, variables: PromptVariables): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    let formatted = template.template;

    // Replace variables in template
    for (const variable of template.inputVariables) {
      const value = variables[variable];
      if (value !== undefined) {
        const placeholder = `{${variable}}`;
        formatted = formatted.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
      } else {
        console.warn(`Variable '${variable}' not provided for template '${templateName}'`);
      }
    }

    return formatted;
  }

  /**
   * Get a template by name
   */
  static getTemplate(templateName: string): PromptTemplate | undefined {
    return this.templates.get(templateName);
  }

  /**
   * List all available templates
   */
  static listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Add a custom template
   */
  static addTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * Build system prompt for llama.cpp with identity
   */
  static buildSystemPrompt(agentConfig?: any): string {
    return "You are ZombieCoder. Answer questions directly in Bengali. No repetition.";
  }

  /**
   * Validate template variables
   */
  static validateTemplate(templateName: string, variables: PromptVariables): boolean {
    const template = this.templates.get(templateName);
    if (!template) return false;

    const missingVars = template.inputVariables.filter(v => variables[v] === undefined);
    if (missingVars.length > 0) {
      console.warn(`Missing variables for template '${templateName}': ${missingVars.join(', ')}`);
      return false;
    }

    return true;
  }
}
