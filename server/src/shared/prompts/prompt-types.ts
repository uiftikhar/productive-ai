export enum SystemRoleEnum {
  AGILE_COACH = 'AGILE_COACH',
  MEETING_CHUNK_SUMMARIZER = 'MEETING_CHUNK_SUMMARIZER',
  FINAL_SUMMARY_GENERATOR = 'FINAL_SUMMARY_GENERATOR',
  MEETING_ANALYST = 'MEETING_ANALYST',
  ASSISTANT = 'ASSISTANT',
}
export type SystemRole =
  | SystemRoleEnum.AGILE_COACH
  | SystemRoleEnum.MEETING_CHUNK_SUMMARIZER
  | SystemRoleEnum.FINAL_SUMMARY_GENERATOR
  | SystemRoleEnum.MEETING_ANALYST
  | SystemRoleEnum.ASSISTANT;

export type SystemMessage = {
  role: 'system';
  content: string;
};

export type TicketFormat = {
  ticketType: string[];
  requiredFields: string[];
  emptyFields?: string[];
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

export type ClassifierFormat = {
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

export type InstructionTemplate<
  T = TicketFormat | MeetingSummaryFormat | ClassifierFormat,
> = {
  format: T;
  rules: string[];
  outputRequirements?: string[];
  promptTemplate?: string;
};
