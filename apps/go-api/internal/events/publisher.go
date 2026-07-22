package events

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"github.com/aws/aws-sdk-go-v2/service/sns/types"
)

const EventTypeGitHubUserSynced = "GitHubUserSynced"

type GitHubUserSynced struct {
	EventVersion  string    `json:"eventVersion"`
	EventType     string    `json:"eventType"`
	EventID       string    `json:"eventId"`
	OccurredAt    time.Time `json:"occurredAt"`
	CorrelationID string    `json:"correlationId"`
	UserID        int64     `json:"userId"`
	GitHubID      int64     `json:"githubId"`
	Username      string    `json:"username"`
	ReposCount    int       `json:"reposCount"`
	Created       bool      `json:"created"`
	TestMode      string    `json:"testMode,omitempty"`
}

type Publisher interface {
	Publish(context.Context, GitHubUserSynced) error
}
type NoopPublisher struct{}

func (NoopPublisher) Publish(context.Context, GitHubUserSynced) error { return nil }

type SNSAPI interface {
	Publish(context.Context, *sns.PublishInput, ...func(*sns.Options)) (*sns.PublishOutput, error)
}
type SNSPublisher struct {
	Client   SNSAPI
	TopicARN string
}

func (p SNSPublisher) Publish(ctx context.Context, event GitHubUserSynced) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	_, err = p.Client.Publish(ctx, &sns.PublishInput{TopicArn: aws.String(p.TopicARN), Message: aws.String(string(body)), MessageAttributes: map[string]types.MessageAttributeValue{
		"eventType":    {DataType: aws.String("String"), StringValue: aws.String(event.EventType)},
		"eventVersion": {DataType: aws.String("String"), StringValue: aws.String(event.EventVersion)},
	}})
	if err != nil {
		return fmt.Errorf("publish event: %w", err)
	}
	return nil
}
