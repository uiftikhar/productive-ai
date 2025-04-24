@startuml Personalized Context for Missed Meetings

skinparam backgroundColor white
skinparam activityBackgroundColor #ECECFF
skinparam activityBorderColor #3C7FC0
skinparam arrowColor #333333
skinparam activityDiamondBackgroundColor #E0E4FF
skinparam activityDiamondBorderColor #3C7FC0
skinparam noteBackgroundColor #FFF7D7
skinparam noteBorderColor #DBA259
skinparam activityEndColor #DD6B66

title Personalized Context for Missed Meetings

|#AntiqueWhite|Team Member|
|#LightSkyBlue|Client Interface|
|#PaleGreen|Master Orchestrator Agent|
|#Lavender|Meeting Analysis Agent|
|#LightSalmon|Personalization Agent|
|#LightCyan|Integration Agent|
|#Thistle|Vector Database|

|Team Member|
start
:Return from absence;
:Open system dashboard;

|Client Interface|
:Display missed meetings notification;
:Show catch-up options;

|Team Member|
:Request personalized catch-up;

|Client Interface|
:Display catch-up generation progress;

|Master Orchestrator Agent|
:Process catch-up request;
:Identify missed meetings;
:Determine relevance to user;
:Coordinate specialized agents;

|Integration Agent|
:Retrieve meeting recordings;
:Access meeting notes;
:Collect follow-up actions;

|Meeting Analysis Agent|
:Process meeting content;
:Extract key decisions;
:Identify action items;
:Detect important discussions;

|Personalization Agent|
:Analyze user's roles and responsibilities;
:Review user's ongoing projects;
:Check user's collaboration network;
:Identify direct mentions and assignments;

|Vector Database|
:Query user's interest embeddings;
:Match to meeting content embeddings;
:Return relevance scores;

|Personalization Agent|
:Prioritize content by relevance;
:Filter for critical information;
:Generate personalized summaries;
:Highlight direct implications;

note right
  Focuses on what the user needs
  to know rather than everything
  that happened
end note

|Master Orchestrator Agent|
:Compile personalized catch-up package;
:Structure by priority;
:Link to detailed resources;

|Client Interface|
:Display personalized catch-up dashboard;
:Present tiered information hierarchy;
:Offer interaction options;

|Team Member|
:Review catch-up summary;

note right
  Summary highlights:
  - Actions assigned to user
  - Decisions affecting user's work
  - Changes to user's projects
  - Mentions of user's areas of responsibility
end note

:Explore specific meeting details;

|Client Interface|
:Display meeting-specific context;
:Show key moments with timestamps;
:Present related documents;

|Team Member|
:Request additional context;

|Client Interface|
:Expand relevant section;
:Show transcript excerpt;
:Display discussion flow;

|Team Member|
:Ask clarifying question;

|Master Orchestrator Agent|
:Process question in context;
:Generate contextual response;
:Add supporting evidence;

|Client Interface|
:Display answer with context;
:Link to meeting recording timestamp;
:Offer follow-up options;

|Team Member|
:Acknowledge understanding;
:Mark catch-up as complete;

|Personalization Agent|
:Update user knowledge state;
:Log interaction for future context;

stop

@enduml