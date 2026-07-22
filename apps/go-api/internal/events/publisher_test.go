package events

import (
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/service/sns"
	"strings"
	"testing"
)

type fakeSNS struct{ input *sns.PublishInput }

func (f *fakeSNS) Publish(_ context.Context, input *sns.PublishInput, _ ...func(*sns.Options)) (*sns.PublishOutput, error) {
	f.input = input
	return &sns.PublishOutput{}, nil
}
func TestSNSPublisherUsesAllowlistedContract(t *testing.T) {
	f := &fakeSNS{}
	e := GitHubUserSynced{EventVersion: "1", EventType: EventTypeGitHubUserSynced, EventID: "e", CorrelationID: "c", UserID: 1, GitHubID: 2, Username: "u", ReposCount: 3}
	if err := (SNSPublisher{Client: f, TopicARN: "arn:test"}).Publish(context.Background(), e); err != nil {
		t.Fatal(err)
	}
	if f.input == nil || f.input.Message == nil {
		t.Fatal("missing publish input")
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(*f.input.Message), &got); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(*f.input.Message, "token") || len(got) != 10 {
		t.Fatalf("unexpected contract: %s", *f.input.Message)
	}
}
