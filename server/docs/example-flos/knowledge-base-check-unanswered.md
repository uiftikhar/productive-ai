@startuml
skinparam backgroundColor white
skinparam activityBackgroundColor #ECECFF
skinparam activityBorderColor #3C7FC0
skinparam arrowColor #333333
skinparam activityDiamondBackgroundColor #E0E4FF
skinparam activityDiamondBorderColor #3C7FC0
skinparam noteBackgroundColor #FFF7D7
skinparam noteBorderColor #DBA259
skinparam activityEndColor #DD6B66

title Knowledge Base Check for Unanswered Questions

|#AntiqueWhite|Knowledge Worker|
|#LightSkyBlue|Client Interface|
|#PaleGreen|Master Orchestrator Agent|
|#Lavender|Question Detection Agent|
|#LightSalmon|Knowledge Base Agent|
|#LightCyan|Expert Routing Agent|
|#Thistle|External Systems|
|#MistyRose|Human Experts|

|Master Orchestrator Agent|
start
:Process meeting transcript;
:Identify discussion segments;
:Detect question patterns;

|Question Detection Agent|
:Extract explicit questions;
:Identify implicit information needs;
:Classify question types;
:Determine if questions were answered;

|Master Orchestrator Agent|
:Filter for unanswered questions;
:Prioritize by importance;
:Schedule knowledge base checks;

|Knowledge Base Agent|
:Format questions for search;
:Generate semantic queries;
:Create alternative phrasings;

|Knowledge Base Agent|
:Search company knowledge base;
:Query documentation;
:Check internal wikis;
:Search previous Q&A records;

|Thistle|
:Search Confluence;
:Query SharePoint;
:Check documentation portal;
:Scan internal forums;

|Knowledge Base Agent|
:Evaluate search results;
:Rank answer candidates;
:Assess answer confidence;
:Format potential answers;

|Master Orchestrator Agent|
:Review answer confidence;

if (Confident answer?) then (Yes)
  |Client Interface|
  :Prepare answer notification;
  :Format knowledge base references;
  
  |Knowledge Worker|
  :Receive answer notification;
  :Review knowledge base answer;
  
  note right
    Notification shows:
    - Original question
    - Answer from knowledge base
    - Source documentation
    - Confidence level
  end note
  
  |Knowledge Worker|
  :Validate answer quality;
  
  if (Answer sufficient?) then (Yes)
    |Knowledge Worker|
    :Mark as resolved;
    :Add optional comment;
    
    |Master Orchestrator Agent|
    :Log resolution;
    :Update question database;
    
  else (No)
    |Knowledge Worker|
    :Request expert input;
    :Add context about why KB answer insufficient;
    
    |Master Orchestrator Agent|
    :Route to expert identification;
  endif
  
else (No confident answer)
  |Master Orchestrator Agent|
  :Prepare for expert routing;
endif

|Expert Routing Agent|
:Analyze question topic;
:Identify subject matter experts;
:Check expert availability;
:Prioritize expert options;

|Expert Routing Agent|
:Format question with context;
:Add knowledge base search results;
:Prepare expert request;

|Client Interface|
:Notify selected expert;
:Provide question context;
:Show failed KB matches;

|Human Experts|
:Receive question notification;
:Review question and context;
:Check knowledge base references;
:Provide expert answer;

|Client Interface|
:Capture expert response;
:Format answer with metadata;

|Master Orchestrator Agent|
:Process expert answer;
:Prepare knowledge update;

|Knowledge Base Agent|
:Format knowledge for storage;
:Update knowledge base;
:Link to original question;
:Add metadata for future retrieval;

|Thistle|
:Update documentation;
:Add to FAQ repository;
:Create searchable entry;

|Client Interface|
:Notify original questioner;
:Provide complete answer;
:Show knowledge base update;

|Knowledge Worker|
:Review expert answer;
:Acknowledge resolution;

|Master Orchestrator Agent|
:Close question loop;
:Update analytics;
:Log knowledge improvement;

stop
@enduml