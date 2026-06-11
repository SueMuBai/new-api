package middleware

import (
	"bytes"
	"fmt"
	"io"
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
	return bytesToLogText(w.buffer.Bytes(), w.truncated)
}

func bytesToLogText(data []byte, truncated bool) string {
	if len(data) == 0 {
		return ""
	}
	if !utf8.Valid(data) {
		return fmt.Sprintf("[binary content omitted: %d bytes captured]", len(data))
	}
	text := string(data)
	if truncated {
		return text + "\n[truncated]"
	}
	return text
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
	if _, err = storage.Seek(0, io.SeekStart); err != nil {
		return "failed to seek request body: " + err.Error()
	}
	data, err := io.ReadAll(io.LimitReader(storage, int64(limit)+1))
	if err != nil {
		return "failed to read request body: " + err.Error()
	}
	truncated := len(data) > limit
	if truncated {
		data = data[:limit]
	}
	if _, err = storage.Seek(0, io.SeekStart); err == nil {
		c.Request.Body = io.NopCloser(storage)
	}
	return bytesToLogText(data, truncated)
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
