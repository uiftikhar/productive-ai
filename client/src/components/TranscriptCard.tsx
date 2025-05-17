'use client';

import { format } from "date-fns";
import { Eye, Trash2, AlertCircle, CheckCircle, Clock, Upload } from "lucide-react";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Transcript, TranscriptStatus } from "@/types/transcript";

interface TranscriptCardProps {
  transcript: Transcript;
  onView: (transcript: Transcript) => void;
  onDelete: (transcript: Transcript) => void;
}

export function TranscriptCard({ transcript, onView, onDelete }: TranscriptCardProps) {
  const getStatusIcon = () => {
    switch (transcript.status) {
      case TranscriptStatus.UPLOADED:
        return <Upload className="h-4 w-4" />;
      case TranscriptStatus.PROCESSING:
        return <Clock className="h-4 w-4" />;
      case TranscriptStatus.ANALYZED:
        return <CheckCircle className="h-4 w-4" />;
      case TranscriptStatus.ERROR:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusText = () => {
    switch (transcript.status) {
      case TranscriptStatus.UPLOADED:
        return "Uploaded";
      case TranscriptStatus.PROCESSING:
        return "Processing";
      case TranscriptStatus.ANALYZED:
        return "Analyzed";
      case TranscriptStatus.ERROR:
        return "Error";
      default:
        return "Pending";
    }
  };

  const getStatusColor = () => {
    switch (transcript.status) {
      case TranscriptStatus.UPLOADED:
        return "default";
      case TranscriptStatus.PROCESSING:
        return "info";
      case TranscriptStatus.ANALYZED:
        return "success";
      case TranscriptStatus.ERROR:
        return "destructive";
      default:
        return "warning";
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-grow pt-6">
        <div className="flex justify-between mb-2">
          <Badge variant={getStatusColor()}>
            <span className="flex items-center gap-1">
              {getStatusIcon()}
              {getStatusText()}
            </span>
          </Badge>
          {transcript.isTemporary && (
            <Badge variant="warning">Temporary</Badge>
          )}
        </div>
        <h3 className="font-medium line-clamp-1 mb-1">{transcript.title}</h3>
        <p className="text-sm text-muted-foreground mb-2">
          {format(new Date(transcript.uploadDate), "MMM d, yyyy")}
        </p>
        <p className="text-sm line-clamp-2 text-muted-foreground">
          {transcript.summary || "No summary available"}
        </p>
      </CardContent>
      <CardFooter className="border-t pt-4 flex justify-between">
        <Button variant="outline" size="sm" onClick={() => onView(transcript)}>
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(transcript)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete transcript</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
} 