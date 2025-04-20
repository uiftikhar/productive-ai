@startuml Meeting Brief with Unanswered Questions

skinparam backgroundColor white
skinparam activityBackgroundColor #ECECFF
skinparam activityBorderColor #3C7FC0
skinparam arrowColor #333333
skinparam activityDiamondBackgroundColor #E0E4FF
skinparam activityDiamondBorderColor #3C7FC0
skinparam noteBackgroundColor #FFF7D7
skinparam noteBorderColor #DBA259
skinparam activityEndColor #DD6B66

title Meeting Brief with Unanswered Questions

|#AntiqueWhite|Manager|
|#LightSkyBlue|Client Interface|
|#PaleGreen|Master Orchestrator Agent|
|#Lavender|Meeting Analysis Agent|
|#LightSalmon|Knowledge Gap Agent|
|#LightYellow|Integration Agent|
|#Thistle|External Systems|

|Manager|
start
:Open system dashboard;
:Select recent meeting for review;

|Client Interface|
:Request meeting analysis;
:Display loading indicator;

|Master Orchestrator Agent|
:Process meeting review request;
:Determine required analysis types;
:Coordinate specialized agents;

|Meeting Analysis Agent|
:Process meeting transcript;
:Extract key topics discussed;
:Identify action items;
:Detect decisions made;

|Knowledge Gap Agent|
:Analyze for unanswered questions;
:Classify questions by domain;
:Assess question importance;
:Evaluate team knowledge alignment;

note right
  Identifies misalignments where
  different teams have conflicting
  understanding of topics
end note

|Integration Agent|
:Query project management tools;
:Check for related documentation;
:Verify if questions exist in knowledge base;

|Master Orchestrator Agent|
:Compile comprehensive analysis;
:Prioritize items requiring attention;

|Client Interface|
:Generate interactive meeting brief;
:Highlight knowledge gaps;
:Visualize team misalignments;
:Display unanswered questions;

|Manager|
:Review meeting summary;
:Focus on knowledge gaps tab;

note right
  Shows topics where teams
  have different understandings
  or missing information
end note

:Explore team misalignment details;

|Client Interface|
:Display topic misalignment visualization;
:Show conflicting statements by team;
:Present supporting evidence;

|Manager|
:Select unanswered questions for resolution;

|Client Interface|
:Display resolution options;

|Manager|
:Choose resolution approach;

if (Add to knowledge base?) then (Yes)
  |Knowledge Gap Agent|
  :Format question for documentation;
  :Generate draft answer based on context;
  
  |Integration Agent|
  :Add to company wiki/knowledge base;
  :Link to relevant resources;
  
  |Thistle|
  :Update Confluence/documentation;
  
else (No)
  if (Assign to team member?) then (Yes)
    |Knowledge Gap Agent|
    :Format as action item;
    
    |Integration Agent|
    :Create task in project management tool;
    :Assign to appropriate expert;
    
    |Thistle|
    :Create ticket in Jira;
    :Send notification in Slack;
  else (Schedule discussion)
    |Integration Agent|
    :Add topic to next meeting agenda;
    :Include context and background;
    
    |Thistle|
    :Update calendar event;
    :Send notification to participants;
  endif
endif

|Client Interface|
:Confirm resolution actions;
:Update knowledge gap status;

|Manager|
:Review other unanswered questions;
:Finalize all resolution actions;
stop

@enduml