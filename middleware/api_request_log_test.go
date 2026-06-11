package middleware

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestCompactStreamResponseLogTextMergesDeltaContent(t *testing.T) {
	input := `data: {"id":"resp_1","object":"chat.completion.chunk","created":1781172722,"model":"gpt-5.4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null,"native_finish_reason":null}]}

data: {"id":"resp_1","object":"chat.completion.chunk","created":1781172722,"model":"gpt-5.4","choices":[{"index":0,"delta":{"content":",\n\n"},"finish_reason":null,"native_finish_reason":null}]}

data: {"id":"resp_1","object":"chat.completion.chunk","created":1781172722,"model":"gpt-5.4","choices":[{"index":0,"delta":{"content":"world"},"finish_reason":"stop","native_finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}

data: [DONE]`

	compacted, ok := compactStreamResponseLogText(input)

	require.True(t, ok)
	require.True(t, strings.HasPrefix(compacted, "data: "))
	require.NotContains(t, compacted, "\n\ndata:")

	var body map[string]interface{}
	require.NoError(t, common.Unmarshal([]byte(strings.TrimPrefix(compacted, "data: ")), &body))
	require.Equal(t, true, body["log_compacted"])
	require.Equal(t, float64(3), body["stream_chunk_count"])
	require.Equal(t, true, body["stream_done"])

	choices, ok := body["choices"].([]interface{})
	require.True(t, ok)
	require.Len(t, choices, 1)

	choice, ok := choices[0].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, float64(0), choice["index"])
	require.Equal(t, "stop", choice["finish_reason"])
	require.Equal(t, "stop", choice["native_finish_reason"])

	delta, ok := choice["delta"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "assistant", delta["role"])
	require.Equal(t, "Hello,\n\nworld", delta["content"])

	usage, ok := body["usage"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, float64(3), usage["total_tokens"])
}

func TestResponseBytesToLogTextLeavesPlainTextUnchanged(t *testing.T) {
	input := "plain response body"

	require.Equal(t, input, responseBytesToLogText([]byte(input), false))
}

func TestCompactResponsesStreamUsesCompletedResponse(t *testing.T) {
	input := `event: response.created
data: {"type":"response.created","response":{"id":"resp_1","object":"response","status":"in_progress","instructions":"large instructions","tools":[{"type":"function","name":"tool"}],"output":[]},"sequence_number":1}

event: response.output_item.added
data: {"type":"response.output_item.added","item":{"id":"msg_1","type":"message","status":"in_progress","content":[]},"output_index":0,"sequence_number":2}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"Hel","sequence_number":3}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"lo","sequence_number":4}

event: response.output_text.done
data: {"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":"Hello","sequence_number":5}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_1","object":"response","status":"completed","instructions":"large instructions","tools":[{"type":"function","name":"tool"}],"model":"gpt-5.4","output":[{"id":"msg_1","type":"message","status":"completed","content":[{"type":"output_text","text":"Hello"}]}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3}},"sequence_number":6}`

	compacted := responseBytesToLogText([]byte(input), false)

	require.Contains(t, compacted, "event: response.log_compacted")
	require.NotContains(t, compacted, "response.created")
	require.NotContains(t, compacted, "large instructions")

	var body map[string]interface{}
	require.NoError(t, common.Unmarshal([]byte(strings.TrimPrefix(compacted, "event: response.log_compacted\ndata: ")), &body))
	require.Equal(t, true, body["log_compacted"])
	require.Equal(t, "responses", body["log_stream_format"])

	response, ok := body["response"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "completed", response["status"])
	require.Nil(t, response["instructions"])
	require.Nil(t, response["tools"])

	output, ok := response["output"].([]interface{})
	require.True(t, ok)
	require.Len(t, output, 1)
}

func TestResponseBytesToLogTextMarksFailedCompactionAndKeepsOriginal(t *testing.T) {
	input := `event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"partial","sequence_number":1}`

	result := responseBytesToLogText([]byte(input), true)

	require.Contains(t, result, "event: log.compaction_failed")
	require.Contains(t, result, `"log_compaction_failed":true`)
	require.Contains(t, result, input)
	require.Contains(t, result, "[truncated]")
}

func TestRequestBytesToLogTextCompactsNoisyRequestFields(t *testing.T) {
	longText := strings.Repeat("x", 2000)
	input := `{"model":"gpt-5.4","instructions":"` + longText + `","tools":[{"type":"function","function":{"name":"search","description":"` + longText + `","parameters":{"type":"object","properties":{"q":{"type":"string"}}}}}],"input":[{"role":"developer","content":"` + longText + `"},{"type":"reasoning","summary":[],"encrypted_content":"` + longText + `"},{"role":"user","content":"keep this"}],"stream":true}`

	compacted := requestBytesToLogText([]byte(input), false)

	require.NotEqual(t, input, compacted)
	require.Contains(t, compacted, `"log_compacted":true`)
	require.Contains(t, compacted, `"parameters_omitted":true`)
	require.Contains(t, compacted, `"original_bytes"`)
	require.Contains(t, compacted, "keep this")
	require.NotContains(t, compacted, strings.Repeat("x", 1500))
}

func TestRequestBodyStorageToLogTextCompactsBeforeFinalLimit(t *testing.T) {
	longText := strings.Repeat("x", 10*1024)
	input := `{"model":"gpt-5.4","instructions":"` + longText + `","input":[{"role":"developer","content":"` + longText + `"},{"role":"user","content":"keep this"}],"stream":true}`
	storage, err := common.CreateBodyStorage([]byte(input))
	require.NoError(t, err)
	defer storage.Close()

	result := requestBodyStorageToLogText(storage, 4096)

	require.Contains(t, result, `"log_compacted":true`)
	require.Contains(t, result, `"original_bytes"`)
	require.Contains(t, result, "keep this")
	require.NotContains(t, result, "[truncated]")
	require.NotContains(t, result, strings.Repeat("x", 5000))
	require.True(t, len(result) <= 4096)
}

func TestRequestBytesToLogTextMarksTruncatedJsonCompactionFailure(t *testing.T) {
	input := `{"model":"gpt-5.4","instructions":"partial`

	result := requestBytesToLogText([]byte(input), true)

	require.Contains(t, result, "event: log.compaction_failed")
	require.Contains(t, result, `"log_compaction_failed":true`)
	require.Contains(t, result, apiRequestLogRequestTruncatedBeforeReason)
	require.Contains(t, result, input)
	require.Contains(t, result, "[truncated]")
}

func TestApiRequestLogRequestReadLimitAllowsSmallFullRequestCompaction(t *testing.T) {
	finalLimit := 1024

	require.Equal(t, int64(2048), apiRequestLogRequestReadLimit(2048, finalLimit))
	require.Equal(t, int64(finalLimit), apiRequestLogRequestReadLimit(common.GetApiRequestLogRequestCompactionLimitBytes()+1, finalLimit))
}
