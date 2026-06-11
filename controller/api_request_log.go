package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func parseOptionalIntQuery(c *gin.Context, key string) (*int, error) {
	value := c.Query(key)
	if value == "" {
		return nil, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func GetApiRequestLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	userId, err := parseOptionalIntQuery(c, "user_id")
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	channelId, err := parseOptionalIntQuery(c, "channel_id")
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	statusCode, err := parseOptionalIntQuery(c, "status_code")
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	logs, total, err := model.GetApiRequestLogs(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), model.ApiRequestLogQueryParams{
		UserID:            userId,
		Username:          c.Query("username"),
		TokenName:         c.Query("token_name"),
		ModelName:         c.Query("model_name"),
		ChannelID:         channelId,
		Path:              c.Query("path"),
		StatusCode:        statusCode,
		RequestID:         c.Query("request_id"),
		UpstreamRequestID: c.Query("upstream_request_id"),
		StartTimestamp:    startTimestamp,
		EndTimestamp:      endTimestamp,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

func GetApiRequestLog(c *gin.Context) {
	logId, err := strconv.Atoi(c.Param("log_id"))
	if err != nil || logId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	log, err := model.GetApiRequestLogByLogID(logId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, log)
}

func DeleteApiRequestLogs(c *gin.Context) {
	targetTimestamp, err := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if err != nil || targetTimestamp <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	count, err := model.DeleteApiRequestLogsBefore(targetTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, count)
}

type UpdateUserApiRequestLogRequest struct {
	Enabled bool `json:"enabled"`
}

func UpdateUserApiRequestLog(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	var req UpdateUserApiRequestLogRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if _, err := model.GetUserById(userId, true); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateUserApiRequestLogEnabled(userId, req.Enabled); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"enabled": req.Enabled})
}
