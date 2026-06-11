package middleware

import (
	"bytes"
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

type apiRequestLogWriter struct {
	gin.ResponseWriter
	buffer    bytes.Buffer
	limit     int
	truncated bool
}

const (
	apiRequestLogTruncatedMarker              = "\n[truncated]"
	apiRequestLogRequestTruncatedBeforeReason = "request body was truncated before compaction"
)

func (w *apiRequestLogWriter) capture(data []byte) {
	if len(data) == 0 || w.limit <= 0 {
		return
	}
	remaining := w.limit - w.buffer.Len()
	if remaining <= 0 {
		w.truncated = true
		return
	}
	if len(data) > remaining {
		w.buffer.Write(data[:remaining])
		w.truncated = true
		return
	}
	w.buffer.Write(data)
}

func (w *apiRequestLogWriter) Write(data []byte) (int, error) {
	w.capture(data)
	return w.ResponseWriter.Write(data)
}

func (w *apiRequestLogWriter) WriteString(data string) (int, error) {
	w.capture([]byte(data))
	return w.ResponseWriter.WriteString(data)
}

func (w *apiRequestLogWriter) bodyText() string {
	return responseBytesToLogText(w.buffer.Bytes(), w.truncated)
}

func requestBytesToLogText(data []byte, truncated bool) string {
	if len(data) == 0 {
		return ""
	}
	if !utf8.Valid(data) {
		return fmt.Sprintf("[binary content omitted: %d bytes captured]", len(data))
	}
	text := string(data)
	if compacted, ok := compactRequestLogText(text); ok {
		if truncated {
			return compacted + apiRequestLogTruncatedMarker
		}
		return compacted
	}
	if truncated {
		if looksLikeJsonLogText(text) {
			return compactionFailedLogText(apiRequestLogRequestTruncatedBeforeReason, text, true)
		}
		return text + apiRequestLogTruncatedMarker
	}
	return text
}

type compactStreamChoice struct {
	base               map[string]interface{}
	role               interface{}
	finishReason       interface{}
	nativeFinishReason interface{}
	content            strings.Builder
	reasoningContent   strings.Builder
	reasoning          strings.Builder
	hasDeltaText       bool
}

type streamLogEvent struct {
	event string
	data  string
}

type streamDeltaMerge struct {
	delta   strings.Builder
	done    string
	hasDone bool
}

func responseBytesToLogText(data []byte, truncated bool) string {
	if len(data) == 0 {
		return ""
	}
	if !utf8.Valid(data) {
		return fmt.Sprintf("[binary content omitted: %d bytes captured]", len(data))
	}
	text := string(data)
	compacted, recognized, errMessage := compactResponseStreamLogText(text, truncated)
	if compacted != "" {
		return compacted
	}
	if recognized && errMessage != "" {
		return compactionFailedLogText(errMessage, text, truncated)
	}
	if truncated {
		return text + apiRequestLogTruncatedMarker
	}
	return text
}

func looksLikeJsonLogText(text string) bool {
	trimmed := strings.TrimSpace(text)
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func cloneLogMap(src map[string]interface{}) map[string]interface{} {
	data, err := common.Marshal(src)
	if err != nil {
		return nil
	}
	var dst map[string]interface{}
	if err := common.Unmarshal(data, &dst); err != nil {
		return nil
	}
	return dst
}

func mapFromLogValue(value interface{}) (map[string]interface{}, bool) {
	m, ok := value.(map[string]interface{})
	return m, ok
}

func intFromLogValue(value interface{}) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case float32:
		return int(v), true
	default:
		return 0, false
	}
}

func appendDeltaString(builder *strings.Builder, delta map[string]interface{}, key string) bool {
	value, ok := delta[key].(string)
	if !ok || value == "" {
		return false
	}
	builder.WriteString(value)
	return true
}

func compactResponseStreamLogText(text string, truncated bool) (string, bool, string) {
	events, hasSSE := parseStreamLogEvents(text)
	if !hasSSE {
		return "", false, ""
	}
	if truncated {
		return "", true, "response stream was truncated before compaction"
	}
	if compacted, ok, errMessage := compactResponsesStreamLogEvents(events); ok || errMessage != "" {
		return compacted, true, errMessage
	}
	if compacted, ok, errMessage := compactChatCompletionStreamLogEvents(events); ok || errMessage != "" {
		return compacted, true, errMessage
	}
	return "", false, ""
}

func parseStreamLogEvents(text string) ([]streamLogEvent, bool) {
	lines := strings.Split(text, "\n")
	events := make([]streamLogEvent, 0)
	currentEvent := ""
	dataLines := make([]string, 0)
	hasSSE := false

	flush := func() {
		if currentEvent == "" && len(dataLines) == 0 {
			return
		}
		events = append(events, streamLogEvent{
			event: currentEvent,
			data:  strings.Join(dataLines, "\n"),
		})
		currentEvent = ""
		dataLines = dataLines[:0]
	}

	for _, line := range lines {
		line = strings.TrimSuffix(line, "\r")
		if line == "" {
			flush()
			continue
		}
		if strings.HasPrefix(line, "event:") {
			hasSSE = true
			currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if strings.HasPrefix(line, "data:") {
			hasSSE = true
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	flush()

	return events, hasSSE
}

func streamEventName(event streamLogEvent, payload map[string]interface{}) string {
	if event.event != "" {
		return event.event
	}
	if value, ok := payload["type"].(string); ok {
		return value
	}
	return ""
}

func mergeKey(itemID string, outputIndex int, contentIndex int) string {
	return fmt.Sprintf("%s:%d:%d", itemID, outputIndex, contentIndex)
}

func appendStreamDelta(merges map[string]*streamDeltaMerge, key string, delta string) {
	if delta == "" {
		return
	}
	merge := merges[key]
	if merge == nil {
		merge = &streamDeltaMerge{}
		merges[key] = merge
	}
	merge.delta.WriteString(delta)
}

func setStreamDone(merges map[string]*streamDeltaMerge, key string, value string) {
	merge := merges[key]
	if merge == nil {
		merge = &streamDeltaMerge{}
		merges[key] = merge
	}
	merge.done = value
	merge.hasDone = true
}

func validateStreamMerges(name string, merges map[string]*streamDeltaMerge) string {
	for key, merge := range merges {
		if merge.delta.Len() == 0 || !merge.hasDone {
			continue
		}
		if merge.delta.String() != merge.done {
			return fmt.Sprintf("%s merge mismatch for %s", name, key)
		}
	}
	return ""
}

func compactResponsesStreamLogEvents(events []streamLogEvent) (string, bool, string) {
	recognized := false
	counts := map[string]interface{}{}
	var completedResponse map[string]interface{}
	outputText := map[string]*streamDeltaMerge{}
	functionArguments := map[string]*streamDeltaMerge{}
	customToolInput := map[string]*streamDeltaMerge{}

	for _, event := range events {
		if strings.TrimSpace(event.data) == "" {
			continue
		}
		var payload map[string]interface{}
		if err := common.Unmarshal([]byte(event.data), &payload); err != nil {
			if strings.HasPrefix(event.event, "response.") {
				return "", true, "failed to parse responses stream event: " + err.Error()
			}
			continue
		}
		eventName := streamEventName(event, payload)
		if eventName == "keepalive" {
			recognized = true
			counts[eventName] = intFromLogValueOrZero(counts[eventName]) + 1
			continue
		}
		if !strings.HasPrefix(eventName, "response.") {
			continue
		}
		recognized = true
		counts[eventName] = intFromLogValueOrZero(counts[eventName]) + 1

		itemID, _ := payload["item_id"].(string)
		outputIndex, _ := intFromLogValue(payload["output_index"])
		contentIndex, _ := intFromLogValue(payload["content_index"])
		key := mergeKey(itemID, outputIndex, contentIndex)

		switch eventName {
		case "response.output_text.delta":
			if delta, ok := payload["delta"].(string); ok {
				appendStreamDelta(outputText, key, delta)
			}
		case "response.output_text.done":
			if text, ok := payload["text"].(string); ok {
				setStreamDone(outputText, key, text)
			}
		case "response.function_call_arguments.delta":
			if delta, ok := payload["delta"].(string); ok {
				appendStreamDelta(functionArguments, key, delta)
			}
		case "response.function_call_arguments.done":
			if arguments, ok := payload["arguments"].(string); ok {
				setStreamDone(functionArguments, key, arguments)
			}
		case "response.custom_tool_call_input.delta":
			if delta, ok := payload["delta"].(string); ok {
				appendStreamDelta(customToolInput, key, delta)
			}
		case "response.custom_tool_call_input.done":
			if input, ok := payload["input"].(string); ok {
				setStreamDone(customToolInput, key, input)
			}
		case "response.completed":
			if response, ok := mapFromLogValue(payload["response"]); ok {
				completedResponse = cloneLogMap(response)
			}
		}
	}

	if !recognized {
		return "", false, ""
	}
	if completedResponse == nil {
		return "", true, "responses stream did not include response.completed"
	}
	if errMessage := validateStreamMerges("output_text", outputText); errMessage != "" {
		return "", true, errMessage
	}
	if errMessage := validateStreamMerges("function_call_arguments", functionArguments); errMessage != "" {
		return "", true, errMessage
	}
	if errMessage := validateStreamMerges("custom_tool_call_input", customToolInput); errMessage != "" {
		return "", true, errMessage
	}

	body := map[string]interface{}{
		"type":                "response.log_compacted",
		"log_compacted":       true,
		"log_stream_format":   "responses",
		"stream_event_count":  len(events),
		"stream_event_counts": counts,
		"response":            compactResponsesObjectForLog(completedResponse),
	}
	data, err := common.Marshal(body)
	if err != nil {
		return "", true, "failed to serialize compacted responses stream: " + err.Error()
	}
	return "event: response.log_compacted\ndata: " + string(data), true, ""
}

func intFromLogValueOrZero(value interface{}) int {
	if parsed, ok := intFromLogValue(value); ok {
		return parsed
	}
	return 0
}

func compactResponsesObjectForLog(response map[string]interface{}) map[string]interface{} {
	omitted := make([]interface{}, 0)
	for _, key := range []string{
		"background",
		"frequency_penalty",
		"instructions",
		"max_output_tokens",
		"max_tool_calls",
		"moderation",
		"parallel_tool_calls",
		"presence_penalty",
		"previous_response_id",
		"prompt_cache_key",
		"prompt_cache_retention",
		"safety_identifier",
		"store",
		"temperature",
		"text",
		"tool_choice",
		"tools",
		"top_logprobs",
		"top_p",
		"truncation",
		"user",
		"metadata",
	} {
		if _, ok := response[key]; ok {
			delete(response, key)
			omitted = append(omitted, key)
		}
	}
	if rawOutput, ok := response["output"].([]interface{}); ok {
		output := make([]interface{}, 0, len(rawOutput))
		for _, item := range rawOutput {
			output = append(output, compactResponseOutputItemForLog(item))
		}
		response["output"] = output
	}
	if len(omitted) > 0 {
		response["log_omitted_fields"] = omitted
	}
	return response
}

func compactResponseOutputItemForLog(item interface{}) interface{} {
	itemMap, ok := mapFromLogValue(item)
	if !ok {
		return item
	}
	itemType, _ := itemMap["type"].(string)
	if itemType == "reasoning" {
		summary := map[string]interface{}{
			"type":        itemType,
			"log_omitted": true,
		}
		for _, key := range []string{"id", "status"} {
			if value, ok := itemMap[key]; ok {
				summary[key] = value
			}
		}
		summary["original_bytes"] = logValueSize(itemMap)
		return summary
	}
	compact := cloneLogMap(itemMap)
	if compact == nil {
		return item
	}
	for _, key := range []string{"arguments", "input"} {
		if value, ok := compact[key].(string); ok {
			compact[key] = compactStringForLog(value, 5000)
		}
	}
	return compact
}

func compactChatCompletionStreamLogEvents(events []streamLogEvent) (string, bool, string) {
	var base map[string]interface{}
	var usage interface{}
	chunks := 0
	done := false
	recognized := false
	choices := map[int]*compactStreamChoice{}

	for _, event := range events {
		payload := strings.TrimSpace(event.data)
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			done = true
			continue
		}

		var chunk map[string]interface{}
		if err := common.Unmarshal([]byte(payload), &chunk); err != nil {
			if event.event == "" {
				return "", true, "failed to parse chat completion stream chunk: " + err.Error()
			}
			continue
		}
		rawChoices, hasChoices := chunk["choices"].([]interface{})
		object, _ := chunk["object"].(string)
		if object == "chat.completion.chunk" || hasChoices {
			recognized = true
		}
		if !recognized {
			continue
		}
		if base == nil {
			base = cloneLogMap(chunk)
		}
		if currentUsage, ok := chunk["usage"]; ok && currentUsage != nil {
			usage = currentUsage
		}
		chunks++

		if !hasChoices {
			continue
		}
		for _, rawChoice := range rawChoices {
			choiceMap, ok := mapFromLogValue(rawChoice)
			if !ok {
				continue
			}
			index := 0
			if parsedIndex, ok := intFromLogValue(choiceMap["index"]); ok {
				index = parsedIndex
			}
			choice := choices[index]
			if choice == nil {
				choice = &compactStreamChoice{base: cloneLogMap(choiceMap)}
				choices[index] = choice
			}
			if finishReason, ok := choiceMap["finish_reason"]; ok && finishReason != nil {
				choice.finishReason = finishReason
			}
			if nativeFinishReason, ok := choiceMap["native_finish_reason"]; ok && nativeFinishReason != nil {
				choice.nativeFinishReason = nativeFinishReason
			}

			delta, ok := mapFromLogValue(choiceMap["delta"])
			if !ok {
				continue
			}
			if role, ok := delta["role"]; ok && role != nil && choice.role == nil {
				choice.role = role
			}
			wrote := appendDeltaString(&choice.content, delta, "content")
			wrote = appendDeltaString(&choice.reasoningContent, delta, "reasoning_content") || wrote
			wrote = appendDeltaString(&choice.reasoning, delta, "reasoning") || wrote
			if wrote {
				choice.hasDeltaText = true
			}
		}
	}

	if !recognized {
		return "", false, ""
	}
	if base == nil || chunks == 0 || len(choices) == 0 {
		return "", true, "chat completion stream did not include mergeable choices"
	}

	indices := make([]int, 0, len(choices))
	hasDeltaText := false
	for index, choice := range choices {
		indices = append(indices, index)
		hasDeltaText = hasDeltaText || choice.hasDeltaText
	}
	if !hasDeltaText {
		return "", true, "chat completion stream did not include delta text"
	}
	sort.Ints(indices)

	compactChoices := make([]interface{}, 0, len(indices))
	for _, index := range indices {
		choice := choices[index]
		compactChoice := choice.base
		if compactChoice == nil {
			compactChoice = map[string]interface{}{"index": index}
		}
		compactChoice["index"] = index
		delta := map[string]interface{}{}
		if choice.role != nil {
			delta["role"] = choice.role
		}
		if choice.content.Len() > 0 {
			delta["content"] = choice.content.String()
		}
		if choice.reasoningContent.Len() > 0 {
			delta["reasoning_content"] = choice.reasoningContent.String()
		}
		if choice.reasoning.Len() > 0 {
			delta["reasoning"] = choice.reasoning.String()
		}
		compactChoice["delta"] = delta
		if choice.finishReason != nil {
			compactChoice["finish_reason"] = choice.finishReason
		}
		if choice.nativeFinishReason != nil {
			compactChoice["native_finish_reason"] = choice.nativeFinishReason
		}
		compactChoices = append(compactChoices, compactChoice)
	}

	base["choices"] = compactChoices
	base["log_compacted"] = true
	base["log_stream_format"] = "chat.completion.chunk"
	base["stream_chunk_count"] = chunks
	if done {
		base["stream_done"] = true
	}
	if usage != nil {
		base["usage"] = usage
	}

	data, err := common.Marshal(base)
	if err != nil {
		return "", true, "failed to serialize compacted chat completion stream: " + err.Error()
	}
	return "data: " + string(data), true, ""
}

func compactionFailedLogText(reason string, original string, truncated bool) string {
	body := map[string]interface{}{
		"type":                  "log.compaction_failed",
		"log_compacted":         false,
		"log_compaction_failed": true,
		"log_compaction_reason": reason,
	}
	data, err := common.Marshal(body)
	if err != nil {
		if truncated {
			return original + apiRequestLogTruncatedMarker
		}
		return original
	}
	text := "event: log.compaction_failed\ndata: " + string(data) + "\n\n" + original
	if truncated {
		return text + apiRequestLogTruncatedMarker
	}
	return text
}

func compactRequestLogText(text string) (string, bool) {
	var request map[string]interface{}
	if err := common.Unmarshal([]byte(text), &request); err != nil {
		return "", false
	}
	compact := cloneLogMap(request)
	if compact == nil {
		return "", false
	}

	recognized := false
	omitted := make([]interface{}, 0)
	if instructions, ok := compact["instructions"].(string); ok {
		if compacted, changed := compactStringForLog(instructions, 1200).(map[string]interface{}); changed {
			compact["instructions"] = compacted
			omitted = append(omitted, "instructions")
		}
		recognized = true
	}
	if rawTools, ok := compact["tools"].([]interface{}); ok {
		compact["tools"] = summarizeLogTools(rawTools)
		compact["log_original_tool_count"] = len(rawTools)
		omitted = append(omitted, "tools[].description", "tools[].parameters")
		recognized = true
	}
	if rawMessages, ok := compact["messages"].([]interface{}); ok {
		compact["messages"] = compactChatMessagesForLog(rawMessages)
		compact["log_original_message_count"] = len(rawMessages)
		recognized = true
	}
	if rawInput, ok := compact["input"].([]interface{}); ok {
		compact["input"] = compactResponsesInputForLog(rawInput)
		compact["log_original_input_count"] = len(rawInput)
		recognized = true
	}
	if !recognized {
		return "", false
	}
	if len(omitted) > 0 {
		compact["log_omitted_fields"] = omitted
	}
	compact["log_compacted"] = true
	compact["log_compaction_type"] = "request"

	data, err := common.Marshal(compact)
	if err != nil {
		return "", false
	}
	return string(data), true
}

func compactStringForLog(value string, maxRunes int) interface{} {
	preview, truncated := truncateLogString(value, maxRunes)
	if !truncated {
		return value
	}
	return map[string]interface{}{
		"log_omitted":    true,
		"original_bytes": len(value),
		"preview":        preview,
	}
}

func truncateLogString(value string, maxRunes int) (string, bool) {
	if maxRunes <= 0 {
		return "", value != ""
	}
	count := 0
	for index := range value {
		if count == maxRunes {
			return value[:index], true
		}
		count++
	}
	return value, false
}

func logValueSize(value interface{}) int {
	data, err := common.Marshal(value)
	if err != nil {
		return 0
	}
	return len(data)
}

func summarizeLogTools(tools []interface{}) []interface{} {
	summaries := make([]interface{}, 0, len(tools))
	for _, rawTool := range tools {
		tool, ok := mapFromLogValue(rawTool)
		if !ok {
			summaries = append(summaries, rawTool)
			continue
		}
		summary := map[string]interface{}{}
		for _, key := range []string{"type", "name"} {
			if value, ok := tool[key]; ok {
				summary[key] = value
			}
		}
		if function, ok := mapFromLogValue(tool["function"]); ok {
			functionSummary := map[string]interface{}{}
			for _, key := range []string{"name", "strict"} {
				if value, ok := function[key]; ok {
					functionSummary[key] = value
				}
			}
			if description, ok := function["description"].(string); ok {
				functionSummary["description"] = compactStringForLog(description, 300)
			}
			if _, ok := function["parameters"]; ok {
				functionSummary["parameters_omitted"] = true
			}
			summary["function"] = functionSummary
		}
		if description, ok := tool["description"].(string); ok {
			summary["description"] = compactStringForLog(description, 300)
		}
		if _, ok := tool["parameters"]; ok {
			summary["parameters_omitted"] = true
		}
		summaries = append(summaries, summary)
	}
	return summaries
}

func compactChatMessagesForLog(messages []interface{}) []interface{} {
	compact := make([]interface{}, 0, len(messages))
	for _, rawMessage := range messages {
		message, ok := mapFromLogValue(rawMessage)
		if !ok {
			compact = append(compact, rawMessage)
			continue
		}
		messageCopy := cloneLogMap(message)
		if messageCopy == nil {
			compact = append(compact, rawMessage)
			continue
		}
		role, _ := messageCopy["role"].(string)
		limit := 2400
		if role == "system" || role == "developer" {
			limit = 1200
		}
		if content, ok := messageCopy["content"].(string); ok {
			messageCopy["content"] = compactStringForLog(content, limit)
		}
		if reasoning, ok := messageCopy["reasoning_content"].(string); ok {
			messageCopy["reasoning_content"] = compactStringForLog(reasoning, 800)
		}
		compact = append(compact, messageCopy)
	}
	return compact
}

func compactResponsesInputForLog(input []interface{}) []interface{} {
	const keepTail = 30
	if len(input) <= keepTail+1 {
		return compactResponsesInputItemsForLog(input)
	}

	compact := make([]interface{}, 0, keepTail+2)
	if first, ok := mapFromLogValue(input[0]); ok {
		firstType, _ := first["type"].(string)
		firstRole, _ := first["role"].(string)
		if firstType == "developer" || firstRole == "developer" || firstRole == "system" {
			compact = append(compact, compactResponsesInputItemForLog(input[0]))
		}
	}

	omittedStart := len(input) - keepTail
	omittedItems := input[:omittedStart]
	if len(compact) > 0 {
		omittedItems = input[1:omittedStart]
	}
	compact = append(compact, map[string]interface{}{
		"log_omitted":         true,
		"omitted_item_count":  len(omittedItems),
		"omitted_type_counts": countLogItemTypes(omittedItems),
	})
	compact = append(compact, compactResponsesInputItemsForLog(input[omittedStart:])...)
	return compact
}

func compactResponsesInputItemsForLog(input []interface{}) []interface{} {
	compact := make([]interface{}, 0, len(input))
	for _, item := range input {
		compact = append(compact, compactResponsesInputItemForLog(item))
	}
	return compact
}

func countLogItemTypes(items []interface{}) map[string]interface{} {
	counts := map[string]interface{}{}
	for _, item := range items {
		itemMap, ok := mapFromLogValue(item)
		key := "unknown"
		if ok {
			if itemType, ok := itemMap["type"].(string); ok && itemType != "" {
				key = itemType
			} else if role, ok := itemMap["role"].(string); ok && role != "" {
				key = role
			}
		}
		counts[key] = intFromLogValueOrZero(counts[key]) + 1
	}
	return counts
}

func compactResponsesInputItemForLog(item interface{}) interface{} {
	itemMap, ok := mapFromLogValue(item)
	if !ok {
		return item
	}
	itemType, _ := itemMap["type"].(string)
	role, _ := itemMap["role"].(string)
	if itemType == "reasoning" || role == "reasoning" {
		summary := map[string]interface{}{
			"log_omitted":    true,
			"original_bytes": logValueSize(itemMap),
		}
		for _, key := range []string{"id", "type", "role", "status"} {
			if value, ok := itemMap[key]; ok {
				summary[key] = value
			}
		}
		return summary
	}

	compact := cloneLogMap(itemMap)
	if compact == nil {
		return item
	}
	limit := 2400
	if role == "developer" || role == "system" || itemType == "developer" {
		limit = 1200
	}
	if strings.HasSuffix(itemType, "_output") || strings.HasSuffix(role, "_output") {
		limit = 600
	}
	for _, key := range []string{"content", "text", "arguments", "input", "output", "reasoning_content"} {
		if value, ok := compact[key].(string); ok {
			compact[key] = compactStringForLog(value, limit)
		}
	}
	return compact
}

func compactStreamResponseLogText(text string) (string, bool) {
	compacted, _, _ := compactResponseStreamLogText(text, false)
	return compacted, compacted != ""
}

func apiRequestLogBodyLimit() int {
	limit := common.GetApiRequestLogBodyLimitBytes()
	if limit <= 0 {
		return 0
	}
	maxInt := int64(^uint(0) >> 1)
	if limit > maxInt {
		return int(maxInt)
	}
	return int(limit)
}

func apiRequestLogRequestReadLimit(storageSize int64, bodyLimit int) int64 {
	if storageSize <= 0 || bodyLimit <= 0 {
		return 0
	}
	finalLimit := int64(bodyLimit)
	if storageSize <= finalLimit {
		return storageSize
	}
	compactionReadLimit := common.GetApiRequestLogRequestCompactionLimitBytes()
	if finalLimit > compactionReadLimit {
		compactionReadLimit = finalLimit
	}
	if storageSize <= compactionReadLimit {
		return storageSize
	}
	return finalLimit
}

func truncateLogTextBytes(text string, limit int) string {
	if limit <= 0 {
		return ""
	}
	if len(text) <= limit {
		return text
	}
	cut := limit
	for cut > 0 && !utf8.ValidString(text[:cut]) {
		cut--
	}
	return text[:cut]
}

func limitLogText(text string, limit int) string {
	if text == "" || limit <= 0 {
		return ""
	}
	truncated := strings.HasSuffix(text, apiRequestLogTruncatedMarker)
	body := strings.TrimSuffix(text, apiRequestLogTruncatedMarker)
	if len(body) <= limit {
		if truncated {
			return body + apiRequestLogTruncatedMarker
		}
		return body
	}
	return truncateLogTextBytes(body, limit) + apiRequestLogTruncatedMarker
}

func requestBodyStorageToLogText(storage common.BodyStorage, limit int) string {
	if storage == nil || limit <= 0 {
		return ""
	}
	if _, err := storage.Seek(0, io.SeekStart); err != nil {
		return "failed to seek request body: " + err.Error()
	}
	readLimit := apiRequestLogRequestReadLimit(storage.Size(), limit)
	if readLimit <= 0 {
		return ""
	}
	data, err := io.ReadAll(io.LimitReader(storage, readLimit))
	if err != nil {
		return "failed to read request body: " + err.Error()
	}
	truncated := storage.Size() > int64(len(data))
	return limitLogText(requestBytesToLogText(data, truncated), limit)
}

func readRequestBodyForLog(c *gin.Context, limit int) string {
	if limit <= 0 {
		return ""
	}
	if c.Request == nil || c.Request.Body == nil {
		return ""
	}
	method := strings.ToUpper(c.Request.Method)
	if method == "GET" || method == "HEAD" {
		return ""
	}

	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return "failed to read request body: " + err.Error()
	}
	body := requestBodyStorageToLogText(storage, limit)
	if _, err = storage.Seek(0, io.SeekStart); err == nil {
		c.Request.Body = io.NopCloser(storage)
	}
	return body
}

func isApiRequestLogEnabled(c *gin.Context) bool {
	if enabled, ok := c.Get("api_request_log_enabled"); ok {
		if enabledBool, ok := enabled.(bool); ok {
			return enabledBool
		}
	}
	userId := c.GetInt("id")
	if userId == 0 {
		return false
	}
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to get user cache for api request logging user %d: %s", userId, err.Error()))
		return false
	}
	c.Set("api_request_log_enabled", userCache.ApiRequestLogEnabled)
	return userCache.ApiRequestLogEnabled
}

func ApiRequestLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request != nil && c.Request.Header.Get("Sec-WebSocket-Protocol") != "" {
			c.Next()
			return
		}
		if !isApiRequestLogEnabled(c) {
			c.Next()
			return
		}

		limit := apiRequestLogBodyLimit()
		requestBody := readRequestBodyForLog(c, limit)
		writer := &apiRequestLogWriter{
			ResponseWriter: c.Writer,
			limit:          limit,
		}
		c.Writer = writer

		c.Next()

		logId := common.GetContextKeyInt(c, constant.ContextKeyApiRequestLogId)
		if logId == 0 {
			return
		}
		createdAt, ok := common.GetContextKeyType[int64](c, constant.ContextKeyApiRequestLogAt)
		if !ok {
			createdAt = common.GetTimestamp()
		}

		log := &model.ApiRequestLog{
			LogID:        logId,
			CreatedAt:    createdAt,
			RequestBody:  requestBody,
			ResponseBody: writer.bodyText(),
		}

		gopool.Go(func() {
			model.RecordApiRequestLog(log)
		})
	}
}
