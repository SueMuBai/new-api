package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func insertUserForSearchTest(t *testing.T, username string, quota int, remark ...string) {
	t.Helper()
	userRemark := ""
	if len(remark) > 0 {
		userRemark = remark[0]
	}
	require.NoError(t, DB.Create(&User{
		Username:    username,
		DisplayName: username,
		Password:    "password123",
		Group:       "default",
		Role:        1,
		Status:      1,
		Quota:       quota,
		Remark:      userRemark,
	}).Error)
}

func resetUsersForSearchTest(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
	t.Cleanup(func() {
		DB.Exec("DELETE FROM users")
	})
}

func collectSearchUsernames(users []*User) []string {
	usernames := make([]string, 0, len(users))
	for _, user := range users {
		usernames = append(usernames, user.Username)
	}
	return usernames
}

func TestSearchUsersAdvancedUsernameFilters(t *testing.T) {
	resetUsersForSearchTest(t)
	insertUserForSearchTest(t, "alice", 100)
	insertUserForSearchTest(t, "bob", 500)
	insertUserForSearchTest(t, "carol", 1000)

	users, total, err := SearchUsers(UserSearchOptions{
		UsernameOperator: UserTextFilterEqual,
		UsernameValue:    "bob",
	}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, []string{"bob"}, collectSearchUsernames(users))

	users, total, err = SearchUsers(UserSearchOptions{
		UsernameOperator: UserTextFilterNotEqual,
		UsernameValue:    "bob",
	}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.ElementsMatch(t, []string{"alice", "carol"}, collectSearchUsernames(users))
}

func TestSearchUsersAdvancedQuotaFilters(t *testing.T) {
	resetUsersForSearchTest(t)
	insertUserForSearchTest(t, "alice", 100)
	insertUserForSearchTest(t, "bob", 500)
	insertUserForSearchTest(t, "carol", 1000)

	quota := 500
	users, total, err := SearchUsers(UserSearchOptions{
		QuotaOperator: UserNumberFilterGreaterThan,
		QuotaValue:    &quota,
	}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, []string{"carol"}, collectSearchUsernames(users))

	users, total, err = SearchUsers(UserSearchOptions{
		QuotaOperator: UserNumberFilterLessThan,
		QuotaValue:    &quota,
	}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, []string{"alice"}, collectSearchUsernames(users))
}

func TestSearchUsersKeywordMatchesRemark(t *testing.T) {
	resetUsersForSearchTest(t)
	insertUserForSearchTest(t, "alice", 100, "vip customer")
	insertUserForSearchTest(t, "bob", 500, "internal test account")

	users, total, err := SearchUsers(UserSearchOptions{
		Keyword: "vip",
	}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, []string{"alice"}, collectSearchUsernames(users))
}
