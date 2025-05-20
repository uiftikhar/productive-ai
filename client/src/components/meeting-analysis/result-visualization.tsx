'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MeetingAnalysisResponse } from '@/lib/api/meeting-analysis-service';
import { Topic, ActionItem, SentimentSegment, Decision } from '@/types/meeting-analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, Clock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useState } from 'react';

interface ResultVisualizationProps {
  data: MeetingAnalysisResponse;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function ResultVisualization({
  data,
  isLoading = false,
  onRefresh,
}: ResultVisualizationProps) {
  const [activeTab, setActiveTab] = useState('summary');

  // Helper function to get the actual data from results
  const getResultData = () => {
    if (!data) return null;

    // New response format with nested results
    if ('results' in data && data.results) {
      // Check if the results field itself also has a nested results field
      if ('results' in data.results && data.results.results) {
        return data.results.results;
      }
      return data.results;
    }

    // Legacy format where data is directly on the results object
    return data;
  };

  // Get the actual data
  const resultData = getResultData() as MeetingAnalysisResponse;

  // Show loading state
  if (isLoading && !resultData) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <h2 className='text-2xl font-bold'>Meeting Analysis Results</h2>
          <Badge variant='outline' className='px-3 py-1'>
            Loading...
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-1/2' />
            <Skeleton className='h-4 w-1/3' />
          </CardHeader>
          <CardContent className='space-y-4'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get status badge
  const getStatusBadge = () => {
    switch (resultData?.status) {
      case 'pending':
        return (
          <Badge variant='outline' className='bg-gray-100'>
            Pending
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant='outline' className='bg-blue-100 text-blue-700'>
            In Progress
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant='outline' className='bg-green-100 text-green-700'>
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant='outline' className='bg-red-100 text-red-700'>
            Failed
          </Badge>
        );
      default:
        return <Badge variant='outline'>Unknown</Badge>;
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return (
          <Badge variant='outline' className='flex items-center gap-1 bg-red-100 text-red-700'>
            <ArrowUpCircle className='h-3 w-3' /> High
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant='outline' className='bg-yellow-100 text-yellow-700'>
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge variant='outline' className='flex items-center gap-1 bg-green-100 text-green-700'>
            <ArrowDownCircle className='h-3 w-3' /> Low
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get status badge for action items
  const getActionStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return (
          <Badge variant='outline' className='flex items-center gap-1 bg-green-100 text-green-700'>
            <CheckCircle2 className='h-3 w-3' /> Completed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant='outline' className='bg-blue-100 text-blue-700'>
            In Progress
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant='outline' className='flex items-center gap-1 bg-gray-100 text-gray-700'>
            <Clock className='h-3 w-3' /> Pending
          </Badge>
        );
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold'>Meeting Analysis Results</h2>
        <div className='flex items-center gap-2'>
          {getStatusBadge()}
          {onRefresh && (
            <Button size='sm' variant='outline' onClick={onRefresh} disabled={isLoading}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          )}
        </div>
      </div>

      {resultData?.errors && resultData.errors.length > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Analysis Errors</AlertTitle>
          <AlertDescription>
            <ul className='mt-2 list-disc pl-5'>
              {resultData.errors.map((error, i) => (
                <li key={i}>
                  {error.step}: {error.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='mb-4 grid grid-cols-4'>
          <TabsTrigger value='summary'>Summary</TabsTrigger>
          <TabsTrigger value='topics'>Topics</TabsTrigger>
          <TabsTrigger value='action-items'>Action Items</TabsTrigger>
          <TabsTrigger value='sentiment'>Sentiment</TabsTrigger>
        </TabsList>

        <TabsContent value='summary' className='space-y-4'>
          {resultData?.summary ? (
            <Card>
              <CardHeader>
                <CardTitle>{resultData.summary.meetingTitle || 'Meeting Summary'}</CardTitle>
                <CardDescription>Session ID: {resultData.sessionId}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <h3 className='font-medium'>Executive Summary</h3>
                  <p className='mt-1'>{resultData.summary.summary}</p>
                </div>

                {resultData.summary.decisions && resultData.summary.decisions.length > 0 && (
                  <div>
                    <h3 className='font-medium'>Key Decisions</h3>
                    <ul className='mt-1 space-y-2'>
                      {resultData.summary.decisions.map((decision: Decision, i: number) => (
                        <li key={i} className='rounded bg-gray-50 p-2'>
                          <p className='font-semibold'>{decision.title}</p>
                          <p>{decision.content}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultData.summary.next_steps && resultData.summary.next_steps.length > 0 && (
                  <div>
                    <h3 className='font-medium'>Next Steps</h3>
                    <ul className='mt-1 list-disc pl-5'>
                      {resultData.summary.next_steps.map((step: string, i: number) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {resultData?.status === 'in_progress' || resultData?.status === 'pending' ? (
                  <p>Summary is still being generated...</p>
                ) : (
                  <p>No summary available.</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value='topics'>
          <Card>
            <CardHeader>
              <CardTitle>Topics</CardTitle>
              <CardDescription>
                {resultData?.topics
                  ? `${resultData.topics.length} topics identified`
                  : 'No topics identified yet'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resultData?.topics && resultData.topics.length > 0 ? (
                <ScrollArea className='h-[500px] pr-4'>
                  <div className='space-y-4'>
                    {resultData.topics.map((topic, i) => (
                      <Card key={i}>
                        <CardHeader className='py-3'>
                          <div className='flex items-start justify-between'>
                            <CardTitle className='text-lg'>{topic.name || topic.topic}</CardTitle>
                            {topic.relevance && <Badge>Relevance: {topic.relevance}/10</Badge>}
                          </div>
                        </CardHeader>
                        <CardContent className='py-2'>
                          {topic.description && <p>{topic.description}</p>}

                          {topic.keywords && topic.keywords.length > 0 && (
                            <div className='mt-3'>
                              <h4 className='text-sm font-medium'>Keywords:</h4>
                              <div className='mt-1 flex flex-wrap gap-1'>
                                {topic.keywords.map((keyword: string, j: number) => (
                                  <Badge variant='outline' key={j}>
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {topic.subtopics && topic.subtopics.length > 0 && (
                            <div className='mt-3'>
                              <h4 className='text-sm font-medium'>Subtopics:</h4>
                              <ul className='mt-1 list-disc pl-5'>
                                {topic.subtopics.map((subtopic: string, j: number) => (
                                  <li key={j}>{subtopic}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {topic.main_participants && topic.main_participants.length > 0 && (
                            <div className='mt-3'>
                              <h4 className='text-sm font-medium'>Main Participants:</h4>
                              <p className='mt-1'>{topic.main_participants.join(', ')}</p>
                            </div>
                          )}

                          {topic.duration && (
                            <div className='mt-3'>
                              <h4 className='text-sm font-medium'>Duration:</h4>
                              <p className='mt-1'>{topic.duration}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className='py-8 text-center text-gray-500'>
                  {resultData?.status === 'in_progress' || resultData?.status === 'pending'
                    ? 'Topics are still being extracted...'
                    : 'No topics were identified in this meeting.'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='action-items'>
          <Card>
            <CardHeader>
              <CardTitle>Action Items</CardTitle>
              <CardDescription>
                {resultData?.actionItems
                  ? `${resultData.actionItems.length} action items identified`
                  : 'No action items identified yet'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resultData?.actionItems && resultData.actionItems.length > 0 ? (
                <ScrollArea className='h-[500px] pr-4'>
                  <div className='space-y-4'>
                    {resultData.actionItems.map((item, i) => (
                      <Card key={i}>
                        <CardHeader className='py-3'>
                          <div className='flex items-start justify-between'>
                            <CardTitle className='text-lg'>{item.description}</CardTitle>
                            <div className='flex gap-2'>
                              {getPriorityBadge(item.priority)}
                              {getActionStatusBadge(item.status)}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className='py-2'>
                          <div className='grid grid-cols-2 gap-4'>
                            {item.assignee && (
                              <div>
                                <h4 className='text-sm font-medium'>Assignee</h4>
                                <p>{item.assignee}</p>
                              </div>
                            )}

                            {item.deadline && (
                              <div>
                                <h4 className='text-sm font-medium'>Due Date</h4>
                                <p>{item.deadline}</p>
                              </div>
                            )}

                            {item.context && (
                              <div className='col-span-2'>
                                <h4 className='text-sm font-medium'>Context</h4>
                                <p>{item.context}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className='py-8 text-center text-gray-500'>
                  {resultData?.status === 'in_progress' || resultData?.status === 'pending'
                    ? 'Action items are still being extracted...'
                    : 'No action items were identified in this meeting.'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='sentiment'>
          <Card>
            <CardHeader>
              <CardTitle>Sentiment Analysis</CardTitle>
              <CardDescription>Emotional tone and key sentiments from the meeting</CardDescription>
            </CardHeader>
            <CardContent>
              {resultData?.sentiment ? (
                <div className='space-y-6'>
                  <div className='flex items-center justify-between'>
                    <h3 className='text-lg font-medium'>Overall Sentiment</h3>
                    <Badge
                      className={`px-3 py-1 ${
                        (resultData.sentiment?.overall ||
                          resultData.sentiment?.overallSentiment) === 'positive'
                          ? 'bg-green-100 text-green-700'
                          : (resultData.sentiment?.overall ||
                                resultData.sentiment?.overallSentiment) === 'negative'
                            ? 'bg-red-100 text-red-700'
                            : (resultData.sentiment?.overall ||
                                  resultData.sentiment?.overallSentiment) === 'mixed'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {(
                        resultData.sentiment?.overall ||
                        resultData.sentiment?.overallSentiment ||
                        'neutral'
                      )
                        .charAt(0)
                        .toUpperCase() +
                        (
                          resultData.sentiment?.overall ||
                          resultData.sentiment?.overallSentiment ||
                          'neutral'
                        ).slice(1)}
                      {resultData.sentiment?.score !== undefined ||
                      resultData.sentiment?.sentimentScore !== undefined
                        ? ` (${(resultData.sentiment?.score ?? resultData.sentiment?.sentimentScore ?? 0).toFixed(2)})`
                        : ''}
                    </Badge>
                  </div>

                  {resultData.sentiment?.keyEmotions &&
                    resultData.sentiment.keyEmotions.length > 0 && (
                      <div>
                        <h3 className='mb-2 text-lg font-medium'>Key Emotions</h3>
                        <div className='flex flex-wrap gap-1'>
                          {resultData.sentiment.keyEmotions.map((emotion: string, i: number) => (
                            <Badge key={i} variant='outline'>
                              {emotion}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {resultData.sentiment?.topicSentiments &&
                    resultData.sentiment.topicSentiments.length > 0 && (
                      <div>
                        <h3 className='mb-2 text-lg font-medium'>Topic Sentiments</h3>
                        <ScrollArea className='h-[200px] pr-4'>
                          <div className='space-y-3'>
                            {resultData.sentiment.topicSentiments.map((topicSentiment, i) => (
                              <div
                                key={i}
                                className={`rounded-lg p-3 ${
                                  topicSentiment.sentiment === 'positive'
                                    ? 'border-l-4 border-green-400 bg-green-50'
                                    : topicSentiment.sentiment === 'negative'
                                      ? 'border-l-4 border-red-400 bg-red-50'
                                      : 'border-l-4 border-gray-400 bg-gray-50'
                                }`}
                              >
                                <div className='mb-1 flex justify-between'>
                                  <span className='text-sm font-medium'>
                                    {topicSentiment.topic}
                                  </span>
                                  <span className='text-xs'>
                                    {topicSentiment.sentiment.charAt(0).toUpperCase() +
                                      topicSentiment.sentiment.slice(1)}
                                    ({topicSentiment.score})
                                  </span>
                                </div>
                                <p className='text-sm'>{topicSentiment.context}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                  {resultData.sentiment?.segments && resultData.sentiment.segments.length > 0 && (
                    <div>
                      <h3 className='mb-2 text-lg font-medium'>Sentiment Segments</h3>
                      <ScrollArea className='h-[300px] pr-4'>
                        <div className='space-y-3'>
                          {resultData.sentiment.segments.map((segment, i) => (
                            <div
                              key={i}
                              className={`rounded-lg p-3 ${
                                segment.sentiment === 'positive'
                                  ? 'border-l-4 border-green-400 bg-green-50'
                                  : segment.sentiment === 'negative'
                                    ? 'border-l-4 border-red-400 bg-red-50'
                                    : 'border-l-4 border-gray-400 bg-gray-50'
                              }`}
                            >
                              <div className='mb-1 flex justify-between'>
                                <span className='text-sm font-medium'>
                                  {segment.speaker ? `${segment.speaker}` : 'Unknown Speaker'}
                                </span>
                                <span className='text-xs'>
                                  {segment.sentiment.charAt(0).toUpperCase() +
                                    segment.sentiment.slice(1)}
                                  ({segment.score.toFixed(2)})
                                </span>
                              </div>
                              <p className='text-sm'>{segment.text}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              ) : (
                <p className='py-8 text-center text-gray-500'>
                  {resultData?.status === 'in_progress' || resultData?.status === 'pending'
                    ? 'Sentiment analysis is still in progress...'
                    : 'No sentiment analysis available for this meeting.'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
