import { z } from 'zod';

// Help Scout API Types
export const InboxSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ConversationSchema = z.object({
  id: z.number(),
  number: z.number(),
  subject: z.string(),
  status: z.enum(['active', 'pending', 'closed', 'spam']),
  state: z.enum(['published', 'draft']),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  assignee: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }).nullable(),
  customer: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }),
  mailbox: z.object({
    id: z.number(),
    name: z.string(),
  }),
  tags: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
  })),
  threads: z.number(),
});

export const ThreadSchema = z.object({
  id: z.number(),
  type: z.enum(['customer', 'note', 'lineitem', 'phone', 'message']),
  status: z.enum(['active', 'pending', 'closed', 'spam']),
  state: z.enum(['published', 'draft', 'hidden']),
  action: z.object({
    type: z.string(),
    text: z.string(),
  }).nullable(),
  body: z.string(),
  source: z.object({
    type: z.string(),
    via: z.string(),
  }),
  customer: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }).nullable(),
  createdBy: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }).nullable(),
  assignedTo: z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// MCP Tool Input Schemas
export const SearchInboxesInputSchema = z.object({
  query: z.string(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const SearchConversationsInputSchema = z.object({
  query: z.string().optional(),
  inboxId: z.string().optional(),
  tag: z.string().optional(),
  status: z.enum(['active', 'pending', 'closed', 'spam']).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'number']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  fields: z.array(z.string()).optional(),
});

export const GetThreadsInputSchema = z.object({
  conversationId: z.string(),
  limit: z.number().min(1).max(200).default(200),
  cursor: z.string().optional(),
});

export const GetConversationSummaryInputSchema = z.object({
  conversationId: z.string(),
});

export const AdvancedConversationSearchInputSchema = z.object({
  contentTerms: z.array(z.string()).optional(),
  subjectTerms: z.array(z.string()).optional(),
  customerEmail: z.string().optional(),
  emailDomain: z.string().optional(),
  tags: z.array(z.string()).optional(),
  inboxId: z.string().optional(),
  status: z.enum(['active', 'pending', 'closed', 'spam']).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

export const MultiStatusConversationSearchInputSchema = z.object({
  searchTerms: z.array(z.string()).min(1, 'At least one search term is required'),
  inboxId: z.string().optional(),
  statuses: z.array(z.enum(['active', 'pending', 'closed', 'spam'])).default(['active', 'pending', 'closed']),
  searchIn: z.array(z.enum(['body', 'subject', 'both'])).default(['both']),
  timeframeDays: z.number().min(1).max(365).default(60),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  limitPerStatus: z.number().min(1).max(100).default(25),
  includeVariations: z.boolean().default(true),
});

// Update Conversation Tags Schema
export const UpdateConversationTagsInputSchema = z.object({
  conversationId: z.string()
    .min(1, 'conversationId is required')
    .regex(/^\d+$/, 'conversationId must be numeric'),
  tags: z.array(z.string())
    .describe('Array of tag names to set on the conversation. WARNING: This REPLACES all existing tags unless preserveExisting is true.'),
  preserveExisting: z.boolean()
    .default(false)
    .describe('If true, fetches existing tags first and merges with new tags. Default: false (replace all).'),
});

// Create Draft Reply Schema
export const CreateDraftReplyInputSchema = z.object({
  conversationId: z.string()
    .min(1, 'conversationId is required')
    .regex(/^\d+$/, 'conversationId must be numeric'),
  text: z.string()
    .min(1, 'Reply text is required')
    .describe('The HTML or plain text content of the draft reply'),
  user: z.number()
    .optional()
    .describe('User ID who is creating the draft. If omitted, uses authenticated user.'),
  status: z.enum(['active', 'pending', 'closed', 'spam'])
    .optional()
    .describe('Status to set on the conversation AFTER the reply is sent. Use "closed" to automatically close the conversation when the draft is sent.'),
});

// Create Note Schema (internal notes not visible to customer)
export const CreateNoteInputSchema = z.object({
  conversationId: z.string()
    .min(1, 'conversationId is required')
    .regex(/^\d+$/, 'conversationId must be numeric'),
  text: z.string()
    .min(1, 'Note text is required')
    .describe('The text content of the internal note. Supports basic HTML formatting.'),
  user: z.number()
    .optional()
    .describe('User ID who is creating the note. If omitted, uses authenticated user.'),
});

// Update Conversation Status Schema
export const UpdateConversationStatusInputSchema = z.object({
  conversationId: z.string()
    .min(1, 'conversationId is required')
    .regex(/^\d+$/, 'conversationId must be numeric'),
  status: z.enum(['active', 'pending', 'closed', 'spam'])
    .describe('The new status for the conversation'),
});

// Response Types
export const ServerTimeSchema = z.object({
  isoTime: z.string(),
  unixTime: z.number(),
});

export const ErrorSchema = z.object({
  code: z.enum(['INVALID_INPUT', 'NOT_FOUND', 'UNAUTHORIZED', 'RATE_LIMIT', 'UPSTREAM_ERROR']),
  message: z.string(),
  retryAfter: z.number().optional(),
  details: z.record(z.unknown()).default({}),
});

// Type exports
export type Inbox = z.infer<typeof InboxSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Thread = z.infer<typeof ThreadSchema>;
export type SearchInboxesInput = z.infer<typeof SearchInboxesInputSchema>;
export type SearchConversationsInput = z.infer<typeof SearchConversationsInputSchema>;
export type GetThreadsInput = z.infer<typeof GetThreadsInputSchema>;
export type GetConversationSummaryInput = z.infer<typeof GetConversationSummaryInputSchema>;
export type AdvancedConversationSearchInput = z.infer<typeof AdvancedConversationSearchInputSchema>;
export type MultiStatusConversationSearchInput = z.infer<typeof MultiStatusConversationSearchInputSchema>;
export type UpdateConversationTagsInput = z.infer<typeof UpdateConversationTagsInputSchema>;
export type CreateDraftReplyInput = z.infer<typeof CreateDraftReplyInputSchema>;
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;
export type UpdateConversationStatusInput = z.infer<typeof UpdateConversationStatusInputSchema>;
export type ServerTime = z.infer<typeof ServerTimeSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;