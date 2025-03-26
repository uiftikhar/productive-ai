export type SystemRole =
  | 'AGILE_COACH'
  | 'MEETING_CHUNK_SUMMARIZER'
  | 'FINAL_SUMMARY_GENERATOR';

export type SystemMessage = {
  role: 'system';
  content: string;
};

export type TicketFormat = {
  ticketType: string[];
  requiredFields: string[];
  emptyFields: string[];
  outputFormat: 'json_array' | 'json_object';
};

export type MeetingSummaryFormat = {
  requiredSections: string[];
  outputFormat: 'json_object';
  jsonSchema: {
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
  };
};

export type InstructionTemplate<T = TicketFormat | MeetingSummaryFormat> = {
  format: T;
  rules: string[];
  outputRequirements?: string[];
};
